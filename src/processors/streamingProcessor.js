import { streamText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getBigQueryTools } from '../services/mcpClient.js';
import { logger, logPerformance } from '../utils/logger.js';

export class StreamingProcessor {
  constructor(options = {}) {
    this.model = options.model || 'gpt-4.1';
    this.dataset = options.dataset || process.env.BIGQUERY_DATASET || 'financial_data';
    this.maxSteps = options.maxSteps || 10;
  }

  async processQuery(query) {
    const startTime = Date.now();
    logger.info(`Starting query processing: ${query}`);
    
    try {
      const { client, tools } = await getBigQueryTools();
      
      // Simple, focused system prompt
      const systemPrompt = `You are a helpful assistant that queries BigQuery databases.
Execute SQL queries and present results in a clear, readable format.
Format tabular data as markdown tables and provide helpful summaries.`;
      
      // Create the stream
      const result = streamText({
        model: openai(this.model),
        system: systemPrompt,
        messages: [
          { role: 'user', content: query }
        ],
        stopWhen: stepCountIs(this.maxSteps),
        tools: tools,
        temperature: 0.1,
      });

      // Collect the full response
      let fullText = '';
      let chunks = [];
      
      for await (const delta of result.textStream) {
        fullText += delta;
        chunks.push(delta);
      }

      // Wait for the final result
      const finalResult = await result;
      
      // Process results
      const processedResult = {
        text: fullText,
        steps: finalResult.steps?.length || 0,
        toolCalls: this.countToolCalls(finalResult.steps),
        chunks: chunks,
        metadata: {
          model: this.model,
          processingTime: Date.now() - startTime
        }
      };
      
      logPerformance('Query processing', startTime);
      logger.info(`Processing completed. Steps: ${processedResult.steps}, Tool calls: ${processedResult.toolCalls}`);
      
      return processedResult;
    } catch (error) {
      logger.error('Processing failed:', error);
      throw error;
    }
  }

  async processPatternMatching(limit = 10) {
    const query = `Analyze cash transactions with unknown patterns:
1. Get ${limit} transactions from ${this.dataset}.cash_transactions where pattern='T_NOTFOUND'
2. Get pattern definitions from ${this.dataset}.cash_processor_patterns
3. Match each transaction's text against pattern definitions
4. Show analysis results with bt_id, text, identified pattern, and confidence`;

    return this.processQuery(query);
  }

  async getTopTransactions(table, limit = 10) {
    const query = `Get top ${limit} transactions from ${table} ordered by transaction amount descending. 
Show all important columns in a clear table format.`;
    
    return this.processQuery(query);
  }

  countToolCalls(steps) {
    if (!steps) return 0;
    return steps.reduce((count, step) => {
      return count + (step.toolCalls?.length || 0);
    }, 0);
  }

  // Stream processor for real-time output
  async *processQueryStream(query) {
    const startTime = Date.now();
    
    try {
      const { client, tools } = await getBigQueryTools();
      
      const result = streamText({
        model: openai(this.model),
        system: 'You are a helpful BigQuery assistant. Execute queries and explain results clearly.',
        messages: [{ role: 'user', content: query }],
        stopWhen: stepCountIs(this.maxSteps),
        tools: tools,
        temperature: 0.1,
      });

      // Yield chunks as they arrive
      for await (const delta of result.textStream) {
        yield { type: 'text', content: delta };
      }

      // Get final result for metadata
      const finalResult = await result;
      
      yield {
        type: 'metadata',
        content: {
          steps: finalResult.steps?.length || 0,
          toolCalls: this.countToolCalls(finalResult.steps),
          processingTime: Date.now() - startTime
        }
      };
      
    } catch (error) {
      yield { type: 'error', content: error.message };
    }
  }
}