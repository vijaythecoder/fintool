import { streamText, stepCountIs } from 'ai';
import { createOpenRouter } from '@openrouter/ai-sdk-provider';
import { queryBigQuery } from '../services/bigqueryClient.js';
import { getBigQueryTools } from '../services/mcpClient.js';
import { CSVStreamer } from '../utils/csvStreamer.js';
import { ProgressTracker } from '../utils/progressTracker.js';
import { logger } from '../utils/logger.js';

export class BatchPatternProcessorV7 {
  constructor(options = {}) {
    // Configuration
    this.dataset = options.dataset || process.env.CASH_CLEARING_DATASET || 'ksingamsetty-test.AI_POC';
    this.modelName = options.modelName || process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet';
    this.batchSize = options.batchSize || parseInt(process.env.PATTERN_BATCH_SIZE || '100');
    this.maxDailyLimit = options.maxDailyLimit || parseInt(process.env.PATTERN_MAX_DAILY_LIMIT || '50000');
    this.outputDir = options.outputDir || process.env.PATTERN_OUTPUT_DIR || './results';
    
    // Services
    this.csvStreamer = null;
    this.progressTracker = null;
    this.mcpClient = null;
    this.mcpTools = null;
    this.openrouter = null;
    
    // State
    this.batchId = `BATCH_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    this.processedCount = 0;
  }

  /**
   * Main processing method
   */
  async process(options = {}) {
    const startTime = Date.now();
    logger.info(`Starting batch pattern processing V7: ${this.batchId}`);
    
    try {
      // Initialize services
      await this.initialize();
      
      // Get total count of unprocessed transactions
      const totalCount = await this.getUnprocessedCount();
      logger.info(`Found ${totalCount} unprocessed transactions`);
      
      if (totalCount === 0) {
        return this.createSummary(0, 0, 0, startTime);
      }
      
      // Apply daily limit if needed
      const itemsToProcess = Math.min(totalCount, this.maxDailyLimit);
      if (itemsToProcess < totalCount) {
        logger.warn(`Daily limit applied: processing ${itemsToProcess} of ${totalCount} transactions`);
      }
      
      // Initialize progress tracking
      this.progressTracker.start(itemsToProcess);
      
      // Process in batches
      const results = await this.processBatches(itemsToProcess);
      
      // Finalize and return summary
      return await this.finalize(results, startTime);
      
    } catch (error) {
      logger.error('Batch processing failed:', error);
      throw error;
    } finally {
      await this.cleanup();
    }
  }

  /**
   * Initialize services
   */
  async initialize() {
    // Initialize OpenRouter
    this.openrouter = createOpenRouter({
      apiKey: process.env.OPENROUTER_API_KEY,
    });
    logger.info('Initialized OpenRouter provider');
    
    // Initialize MCP client for BigQuery tools
    logger.info('Connecting to BigQuery MCP server...');
    const { client, tools } = await getBigQueryTools();
    this.mcpClient = client;
    this.mcpTools = tools;
    logger.info('Successfully connected to BigQuery MCP');
    
    // Initialize CSV streamer
    this.csvStreamer = new CSVStreamer({ outputDir: this.outputDir });
    const csvPath = await this.csvStreamer.initialize();
    logger.info(`CSV output initialized: ${csvPath}`);
    
    // Initialize progress tracker
    this.progressTracker = new ProgressTracker({
      batchSize: this.batchSize,
      progressFile: `${this.outputDir}/progress/${this.batchId}.json`,
      onProgress: (progress) => {
        if (progress.processedItems % 100 === 0) {
          logger.info(this.progressTracker.getProgressString());
        }
      }
    });
  }

  /**
   * Get count of unprocessed transactions
   */
  async getUnprocessedCount() {
    const query = `
      SELECT COUNT(*) as total
      FROM ${this.dataset}.cash_transactions
      WHERE PATTERN = 'T_NOTFOUND'
    `;
    
    const rows = await queryBigQuery(query);
    return rows[0]?.total || 0;
  }

  /**
   * Process transactions in batches
   */
  async processBatches(totalItems) {
    const totalBatches = Math.ceil(totalItems / this.batchSize);
    const results = {
      processed: 0,
      succeeded: 0,
      failed: 0,
      errors: []
    };
    
    for (let batchIndex = 0; batchIndex < totalBatches; batchIndex++) {
      try {
        const offset = batchIndex * this.batchSize;
        const limit = Math.min(this.batchSize, totalItems - offset);
        
        logger.info(`Processing batch ${batchIndex + 1}/${totalBatches} (offset: ${offset}, limit: ${limit})`);
        
        // Query transactions
        const transactions = await this.queryBatch(offset, limit);
        
        if (transactions.length === 0) {
          logger.warn(`No transactions found for batch ${batchIndex}`);
          continue;
        }
        
        // Process with AI using MCP tools
        const batchResults = await this.processWithAIAndMCP(transactions, batchIndex);
        
        // Write results to CSV
        await this.csvStreamer.writeRows(batchResults);
        
        // Update progress
        this.progressTracker.recordBatch(
          `batch_${batchIndex}`, 
          batchResults.length, 
          true
        );
        
        // Update totals
        results.processed += batchResults.length;
        results.succeeded += batchResults.filter(r => r.AI_SUGGEST_TEXT !== 'UNKNOWN').length;
        results.failed += batchResults.filter(r => r.AI_SUGGEST_TEXT === 'UNKNOWN').length;
        
      } catch (error) {
        logger.error(`Batch ${batchIndex} failed:`, error);
        results.errors.push({ batchIndex, error: error.message });
        this.progressTracker.recordBatch(`batch_${batchIndex}`, 0, false, error);
      }
    }
    
    return results;
  }

  /**
   * Query a batch of transactions
   */
  async queryBatch(offset, limit) {
    const query = `
      SELECT 
        BT_ID,
        CUSTOMER_ACCOUNT_NUMBER,
        TYPE_CODE,
        TEXT,
        TRANSACTION_AMOUNT,
        TRANSACTION_CURRENCY
      FROM ${this.dataset}.cash_transactions
      WHERE PATTERN = 'T_NOTFOUND'
      ORDER BY BT_ID
      LIMIT ${limit}
      OFFSET ${offset}
    `;
    
    const transactions = await queryBigQuery(query);
    
    // Update last processed ID for progress tracking
    if (transactions.length > 0) {
      const lastId = transactions[transactions.length - 1].BT_ID;
      this.progressTracker.setLastProcessedId(lastId);
    }
    
    return transactions;
  }

  /**
   * Process batch with AI using MCP tools
   */
  async processWithAIAndMCP(transactions, batchIndex) {
    logger.info(`Using AI with MCP tools to process ${transactions.length} transactions`);
    
    // System prompt for AI-driven pattern matching (BigQuery-enabled, less rigid)
    const systemPrompt = `You are a finance-ops analyst helping clear bank-cash suspense items.

Dataset: ${this.dataset}

TOOLS
• You have direct BigQuery access via provided tools – run any SELECT you need on the tables below.

TABLES
• cash_transactions          : source rows, PATTERN='T_NOTFOUND'
• cash_processor_patterns    : pattern_search (SQL LIKE) → pattern_op
• cash_gl_patterns           : pattern → GL_ACCOUNT, FT_ID

BUSINESS CONTEXT
Millions of rows are classified by existing rules; ~1000 remain un-matched daily. Provide the most plausible pattern_op and GL_ACCOUNT for each leftover row.

WORKFLOW (3-step loop)
1. ANALYSE  the TEXT for merchant names, codes, numbers, keywords.
2. MATCH    using smart BigQuery queries on cash_processor_patterns:
   – start with exact LIKE matches (all fragments present).
   – when helpful, filter by CUSTOMER_ACCOUNT_NUMBER and TYPE_CODE.
   – if no exact hit, search for closest partial/fuzzy match.
3. RESOLVE  the GL by looking up cash_gl_patterns for the chosen pattern_op; if none, return UNKNOWN.

SCORING
1.0 exact full match
0.6-0.9 strong partial match
0.3-0.5 weak/fuzzy match
0   unknown

OUTPUT  – return a JSON array (no extra keys), one object per input row with:
BT_ID, TEXT, TRANSACTION_AMOUNT, TRANSACTION_CURRENCY,
AI_SUGGEST_TEXT, AI_CONFIDENCE_SCORE, AI_REASON (≤150 chars),
AI_GL_ACCOUNT, AI_PRCSSR_PTRN_FT, UPDATED_AT (ISO).

Always produce a suggestion; use UNKNOWN and score 0 when no reasonable match exists.`

    // User prompt – provides the transaction payload only
    const userPrompt = `INPUT TRANSACTIONS (${transactions.length} rows):

${JSON.stringify(transactions, null, 2)}

Please apply the workflow described in the system prompt and return the required JSON array.`

    try {
      const result = await streamText({
        model: this.openrouter.chat(this.modelName),
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
        tools: this.mcpTools,
        temperature: 0.1,
        stopWhen: stepCountIs(20), // Allow more steps for multiple queries
        maxSteps: 20
      });

      let fullText = '';
      for await (const delta of result.textStream) {
        fullText += delta;
      }
      
      // Log the AI response for debugging
      logger.debug(`AI Response length: ${fullText.length} characters`);
      if (fullText.length < 1000) {
        logger.debug(`AI Response: ${fullText}`);
      }
      
      // Extract JSON results
      const jsonMatch = fullText.match(/\[\s*\{[\s\S]*?\}\s*\]/);
      if (jsonMatch) {
        const results = JSON.parse(jsonMatch[0]);
        return results.map(r => ({
          ...r,
          UPDATED_AT: r.UPDATED_AT || new Date().toISOString()
        }));
      }
      
      // If no JSON found, log more details
      logger.error('No JSON found in AI response');
      logger.error(`Response preview: ${fullText.substring(0, 500)}...`);
      throw new Error('Failed to extract JSON from AI response');
      
    } catch (error) {
      logger.error('AI processing with MCP failed:', error);
      // Return all as UNKNOWN if AI fails
      return transactions.map(t => ({
        ...t,
        AI_SUGGEST_TEXT: 'UNKNOWN',
        AI_CONFIDENCE_SCORE: '0.1',
        AI_REASON: `AI processing error: ${error.message}`,
        AI_GL_ACCOUNT: 'UNKNOWN',
        AI_PRCSSR_PTRN_FT: 'UNKNOWN',
        UPDATED_AT: new Date().toISOString()
      }));
    }
  }

  /**
   * Create processing summary
   */
  createSummary(processed, succeeded, failed, startTime, additional = {}) {
    const duration = Date.now() - startTime;
    
    return {
      batchId: this.batchId,
      processed,
      succeeded,
      failed,
      successRate: processed > 0 ? (succeeded / processed) * 100 : 0,
      duration,
      durationFormatted: this.formatDuration(duration),
      averageSpeed: processed > 0 ? processed / (duration / 1000) : 0,
      ...additional
    };
  }

  /**
   * Format duration
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Finalize processing
   */
  async finalize(results, startTime) {
    // Close CSV file
    const csvResult = await this.csvStreamer.close();
    
    // Complete progress tracking
    const progressSummary = await this.progressTracker.complete();
    
    // Create final summary
    const summary = this.createSummary(
      results.processed,
      results.succeeded,
      results.failed,
      startTime,
      {
        csvFile: csvResult.filePath,
        csvRows: csvResult.rowCount,
        errors: results.errors,
        progressSummary
      }
    );
    
    logger.info('Batch processing completed:', summary);
    return summary;
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.csvStreamer) {
      await this.csvStreamer.close();
    }
    
    if (this.mcpClient) {
      await this.mcpClient.close();
    }
  }
}