import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getBigQueryTools } from '../services/mcpClient.js';
import { logger, logTransaction, logPerformance } from '../utils/logger.js';
import { format, subDays } from 'date-fns';

export class FinancialProcessor {
  constructor(options = {}) {
    this.model = options.model || 'gpt-4-turbo';
    this.dataset = options.dataset || process.env.BIGQUERY_DATASET || 'financial_data';
    this.maxSteps = options.maxSteps || 10;
    this.confidenceThreshold = options.confidenceThreshold || 0.85;
    this.batchSize = options.batchSize || 100;
  }

  async processFinancialData(date = null) {
    const startTime = Date.now();
    const processingDate = date || subDays(new Date(), 1);
    const dateStr = format(processingDate, 'yyyy-MM-dd');
    
    logger.info(`Starting financial data processing for date: ${dateStr}`);
    
    try {
      const { client, tools } = await getBigQueryTools();
      
      const systemPrompt = this.buildSystemPrompt();
      const userPrompt = this.buildUserPrompt(dateStr);
      
      const result = await generateText({
        model: openai(this.model),
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        tools: tools,
        maxSteps: this.maxSteps,
        temperature: 0.1,
        onStepFinish: (step) => {
          logger.debug(`AI Step completed: ${step.toolCalls?.[0]?.toolName || 'thinking'}`);
        }
      });
      
      const processingResults = this.parseAIResponse(result);
      
      logPerformance('Financial data processing', startTime);
      logger.info(`Processing completed. Matched: ${processingResults.matched}, ` +
                  `Enriched: ${processingResults.enriched}, Failed: ${processingResults.failed}`);
      
      return processingResults;
    } catch (error) {
      logger.error('Financial processing failed:', error);
      throw error;
    }
  }

  buildSystemPrompt() {
    return `You are an expert financial analyst specializing in cash clearing and transaction reconciliation.
Your role is to analyze unmatched transactions marked as T_NOT_FOUND and either:
1. Find matching transactions with high confidence
2. Enrich transactions with insights for human review

Key responsibilities:
- Query unmatched transactions from the ${this.dataset}.unmatched_transactions table
- Analyze patterns in reference numbers, amounts, dates, and merchant names
- Look for potential matches in the ${this.dataset}.all_transactions table
- Consider timing offsets (payments may arrive 1-3 days after expected)
- Handle merchant name variations and abbreviations
- Calculate confidence scores for matches

Matching criteria:
- Exact amount match: +0.3 confidence
- Reference number similarity >80%: +0.4 confidence
- Date within 3 days: +0.2 confidence
- Merchant name similarity >70%: +0.1 confidence

Only auto-resolve if confidence >= ${this.confidenceThreshold}
Otherwise, add enrichment notes for human review.

Use structured output in your final update queries.`;
  }

  buildUserPrompt(dateStr) {
    return `Please process unmatched transactions for ${dateStr}:

1. Query unmatched transactions:
   - Status = 'T_NOT_FOUND'
   - Date = '${dateStr}'
   - Limit to ${this.batchSize} records for this batch

2. For each transaction:
   - Search for potential matches in all_transactions
   - Calculate match confidence
   - If confidence >= ${this.confidenceThreshold}: Update status to 'MATCHED'
   - Otherwise: Add enrichment notes with potential matches

3. Update the processed transactions:
   - Set processed_date = CURRENT_TIMESTAMP()
   - Set processing_method = 'AI_${this.model}'
   - Update match_confidence, matched_transaction_id if found
   - Add resolution_notes with your analysis

4. Insert summary into processing_log table with:
   - Total processed
   - Matched count
   - Enriched count
   - Failed count
   - Processing duration`;
  }

  parseAIResponse(result) {
    try {
      const text = result.text || '';
      
      const matched = parseInt(text.match(/matched[:\s]+(\d+)/i)?.[1] || '0');
      const enriched = parseInt(text.match(/enriched[:\s]+(\d+)/i)?.[1] || '0');
      const failed = parseInt(text.match(/failed[:\s]+(\d+)/i)?.[1] || '0');
      const total = matched + enriched + failed;
      
      return {
        total,
        matched,
        enriched,
        failed,
        details: result.toolCalls || [],
        summary: text
      };
    } catch (error) {
      logger.error('Failed to parse AI response:', error);
      return {
        total: 0,
        matched: 0,
        enriched: 0,
        failed: 0,
        details: [],
        summary: 'Processing completed with parsing error'
      };
    }
  }

  async processSingleTransaction(transaction, client, tools) {
    const startTime = Date.now();
    
    try {
      logTransaction('analyzing', transaction.transaction_id, {
        amount: transaction.amount,
        reference: transaction.reference_number
      });
      
      const result = await generateText({
        model: openai(this.model),
        messages: [
          {
            role: 'system',
            content: 'Analyze this single transaction and find the best match.'
          },
          {
            role: 'user',
            content: JSON.stringify(transaction)
          }
        ],
        tools: tools,
        maxSteps: 5,
        temperature: 0.1
      });
      
      logTransaction('processed', transaction.transaction_id, {
        processingTime: Date.now() - startTime
      });
      
      return result;
    } catch (error) {
      logTransaction('failed', transaction.transaction_id, {
        error: error.message
      });
      throw error;
    }
  }

  async generateProcessingReport(date) {
    const { client } = await getBigQueryTools();
    
    const reportQuery = `
      SELECT 
        processing_date,
        processing_method,
        COUNT(*) as total_processed,
        SUM(CASE WHEN status = 'MATCHED' THEN 1 ELSE 0 END) as matched,
        SUM(CASE WHEN status = 'ENRICHED' THEN 1 ELSE 0 END) as enriched,
        AVG(match_confidence) as avg_confidence,
        MIN(processed_timestamp) as start_time,
        MAX(processed_timestamp) as end_time
      FROM ${this.dataset}.unmatched_transactions
      WHERE DATE(processing_date) = '${date}'
        AND processing_method LIKE 'AI_%'
      GROUP BY processing_date, processing_method
    `;
    
    try {
      const results = await client.callTool({
        name: 'query',
        arguments: { query: reportQuery }
      });
      
      return JSON.parse(results.content);
    } catch (error) {
      logger.error('Failed to generate processing report:', error);
      return null;
    }
  }
}