import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getBigQueryTools, executeQuery, insertRows } from '../services/mcpClient.js';
import { logger, logTransaction, logPerformance } from '../utils/logger.js';
import { processBatches, calculateBatchMetrics, partition } from '../utils/chunks.js';
import { format, subDays } from 'date-fns';

export class AdvancedProcessor {
  constructor(options = {}) {
    this.model = options.model || 'gpt-4-turbo';
    this.dataset = options.dataset || process.env.BIGQUERY_DATASET || 'financial_data';
    this.batchSize = options.batchSize || 100;
    this.concurrency = options.concurrency || 3;
    this.retryAttempts = options.retryAttempts || 3;
    this.confidenceThreshold = options.confidenceThreshold || 0.85;
    this.matchingRules = options.matchingRules || this.getDefaultMatchingRules();
  }

  getDefaultMatchingRules() {
    return {
      exactAmount: { weight: 0.3, tolerance: 0 },
      referenceNumber: { weight: 0.4, minSimilarity: 0.8 },
      dateRange: { weight: 0.2, maxDaysDiff: 3 },
      merchantName: { weight: 0.1, minSimilarity: 0.7 }
    };
  }

  async processWithCustomLogic(date = null) {
    const startTime = Date.now();
    const processingDate = date || subDays(new Date(), 1);
    const dateStr = format(processingDate, 'yyyy-MM-dd');
    
    logger.info(`Starting advanced processing for date: ${dateStr}`);
    
    try {
      const { client, tools } = await getBigQueryTools();
      
      const unmatchedTransactions = await this.queryUnmatchedTransactions(client, dateStr);
      logger.info(`Found ${unmatchedTransactions.length} unmatched transactions`);
      
      if (unmatchedTransactions.length === 0) {
        return { total: 0, matched: 0, enriched: 0, failed: 0 };
      }
      
      const processedResults = await this.processTransactionBatches(
        unmatchedTransactions, 
        client, 
        tools
      );
      
      await this.updateProcessedTransactions(client, processedResults);
      
      const metrics = this.calculateProcessingMetrics(processedResults, startTime);
      await this.logProcessingMetrics(client, metrics, dateStr);
      
      logPerformance('Advanced processing completed', startTime);
      
      return metrics;
    } catch (error) {
      logger.error('Advanced processing failed:', error);
      throw error;
    }
  }

  async queryUnmatchedTransactions(client, dateStr) {
    const query = `
      SELECT 
        transaction_id,
        amount,
        reference_number,
        merchant_name,
        transaction_date,
        original_description,
        retry_count
      FROM ${this.dataset}.unmatched_transactions
      WHERE status = 'T_NOT_FOUND'
        AND DATE(transaction_date) = '${dateStr}'
        AND (retry_count IS NULL OR retry_count < ${this.retryAttempts})
      ORDER BY amount DESC
      LIMIT ${this.batchSize * 10}
    `;
    
    return await executeQuery(client, query);
  }

  async processTransactionBatches(transactions, client, tools) {
    const results = [];
    
    const processedBatches = await processBatches(
      transactions,
      this.batchSize,
      async (batch, batchIndex) => {
        logger.info(`Processing batch ${batchIndex + 1} with ${batch.length} transactions`);
        
        const batchResults = await Promise.all(
          batch.map(transaction => 
            this.processTransactionWithRetry(transaction, client, tools)
          )
        );
        
        return batchResults;
      },
      {
        concurrency: this.concurrency,
        onProgress: (processed, total) => {
          logger.info(`Progress: ${processed}/${total} transactions processed`);
        },
        onError: (error, batch, index) => {
          logger.error(`Batch ${index} failed:`, error);
        }
      }
    );
    
    return processedBatches.flat();
  }

  async processTransactionWithRetry(transaction, client, tools, attempt = 1) {
    try {
      const potentialMatches = await this.findPotentialMatches(transaction, client);
      
      if (potentialMatches.length === 0) {
        return this.enrichTransactionWithAI(transaction, tools);
      }
      
      const matchResults = await this.analyzeMatchesWithAI(
        transaction, 
        potentialMatches, 
        tools
      );
      
      return this.prepareTransactionResult(transaction, matchResults);
    } catch (error) {
      if (attempt < this.retryAttempts) {
        logger.warn(`Retrying transaction ${transaction.transaction_id}, attempt ${attempt + 1}`);
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        return this.processTransactionWithRetry(transaction, client, tools, attempt + 1);
      }
      
      logger.error(`Failed to process transaction ${transaction.transaction_id}:`, error);
      return {
        ...transaction,
        status: 'FAILED',
        error_message: error.message,
        processed_timestamp: new Date().toISOString()
      };
    }
  }

  async findPotentialMatches(transaction, client) {
    const dateRangeStart = format(
      subDays(new Date(transaction.transaction_date), this.matchingRules.dateRange.maxDaysDiff),
      'yyyy-MM-dd'
    );
    const dateRangeEnd = format(
      new Date(transaction.transaction_date),
      'yyyy-MM-dd'
    );
    
    const query = `
      SELECT 
        transaction_id as matched_id,
        amount as matched_amount,
        reference_number as matched_reference,
        merchant_name as matched_merchant,
        transaction_date as matched_date,
        ABS(amount - ${transaction.amount}) as amount_diff,
        EDIT_DISTANCE(UPPER(reference_number), UPPER('${transaction.reference_number}')) as ref_distance
      FROM ${this.dataset}.all_transactions
      WHERE transaction_date BETWEEN '${dateRangeStart}' AND '${dateRangeEnd}'
        AND ABS(amount - ${transaction.amount}) <= ${transaction.amount * 0.01}
        AND status != 'MATCHED'
      ORDER BY amount_diff, ref_distance
      LIMIT 10
    `;
    
    return await executeQuery(client, query);
  }

  async analyzeMatchesWithAI(transaction, potentialMatches, tools) {
    const result = await generateText({
      model: openai(this.model),
      messages: [
        {
          role: 'system',
          content: `Analyze transaction matches and calculate confidence scores.
            Matching weights: ${JSON.stringify(this.matchingRules)}
            Return JSON with: { bestMatch: { id, confidence, reasons }, alternatives: [...] }`
        },
        {
          role: 'user',
          content: JSON.stringify({
            original: transaction,
            potentialMatches: potentialMatches
          })
        }
      ],
      temperature: 0.1,
      responseFormat: { type: 'json' }
    });
    
    return JSON.parse(result.text);
  }

  async enrichTransactionWithAI(transaction, tools) {
    const result = await generateText({
      model: openai(this.model),
      messages: [
        {
          role: 'system',
          content: 'Analyze this unmatched transaction and provide enrichment insights.'
        },
        {
          role: 'user',
          content: `Analyze: ${JSON.stringify(transaction)}
            Provide: pattern analysis, likely match criteria, suggested actions`
        }
      ],
      temperature: 0.3
    });
    
    return {
      ...transaction,
      status: 'ENRICHED',
      enrichment_notes: result.text,
      processed_timestamp: new Date().toISOString()
    };
  }

  prepareTransactionResult(transaction, matchResults) {
    const bestMatch = matchResults.bestMatch;
    
    if (bestMatch && bestMatch.confidence >= this.confidenceThreshold) {
      return {
        ...transaction,
        status: 'MATCHED',
        matched_transaction_id: bestMatch.id,
        match_confidence: bestMatch.confidence,
        match_reasons: JSON.stringify(bestMatch.reasons),
        processed_timestamp: new Date().toISOString()
      };
    }
    
    return {
      ...transaction,
      status: 'ENRICHED',
      potential_matches: JSON.stringify(matchResults.alternatives || []),
      match_confidence: bestMatch?.confidence || 0,
      enrichment_notes: `Best match confidence: ${bestMatch?.confidence || 0}. Manual review recommended.`,
      processed_timestamp: new Date().toISOString()
    };
  }

  async updateProcessedTransactions(client, processedResults) {
    const [matched, enriched] = partition(
      processedResults,
      r => r.status === 'MATCHED'
    );
    
    if (matched.length > 0) {
      await insertRows(client, `${this.dataset}.matched_transactions`, matched);
    }
    
    if (enriched.length > 0) {
      await insertRows(client, `${this.dataset}.enriched_transactions`, enriched);
    }
    
    const updateQuery = `
      UPDATE ${this.dataset}.unmatched_transactions
      SET 
        status = CASE 
          WHEN transaction_id IN (${matched.map(m => `'${m.transaction_id}'`).join(',')}) THEN 'MATCHED'
          WHEN transaction_id IN (${enriched.map(e => `'${e.transaction_id}'`).join(',')}) THEN 'ENRICHED'
          ELSE status
        END,
        retry_count = IFNULL(retry_count, 0) + 1,
        last_processed = CURRENT_TIMESTAMP()
      WHERE transaction_id IN (${processedResults.map(r => `'${r.transaction_id}'`).join(',')})
    `;
    
    await executeQuery(client, updateQuery);
  }

  calculateProcessingMetrics(processedResults, startTime) {
    const metrics = calculateBatchMetrics(
      processedResults.length,
      this.batchSize,
      Date.now() - startTime
    );
    
    const statusCounts = processedResults.reduce((acc, r) => {
      acc[r.status] = (acc[r.status] || 0) + 1;
      return acc;
    }, {});
    
    return {
      ...metrics,
      total: processedResults.length,
      matched: statusCounts.MATCHED || 0,
      enriched: statusCounts.ENRICHED || 0,
      failed: statusCounts.FAILED || 0,
      avgConfidence: processedResults
        .filter(r => r.match_confidence)
        .reduce((sum, r) => sum + r.match_confidence, 0) / processedResults.length
    };
  }

  async logProcessingMetrics(client, metrics, dateStr) {
    const logEntry = {
      processing_date: dateStr,
      processing_method: `AI_ADVANCED_${this.model}`,
      total_processed: metrics.total,
      matched_count: metrics.matched,
      enriched_count: metrics.enriched,
      failed_count: metrics.failed,
      avg_confidence: metrics.avgConfidence,
      processing_time_ms: metrics.processingTimeMs,
      items_per_second: metrics.itemsPerSecond,
      timestamp: new Date().toISOString()
    };
    
    await insertRows(client, `${this.dataset}.processing_log`, [logEntry]);
  }
}