/**
 * Enhanced MCP Client for Cash Clearing Operations
 * Extends the existing MCP client with cash clearing specific functionality
 */

import { getBigQueryTools, executeQuery, insertRows } from './mcpClient.js';
import { logger } from '../utils/logger.js';
import { createCashClearingQueryBuilder } from '../utils/queryBuilder.js';

/**
 * Cash Clearing MCP Client
 * Provides specialized BigQuery operations for the cash clearing workflow
 */
export class CashClearingMcpClient {
  constructor(config = {}) {
    this.dataset = config.dataset || 'ksingamsetty-test.AI_POC';
    this.queryBuilder = createCashClearingQueryBuilder(this.dataset);
    this.retryConfig = {
      maxRetries: config.maxRetries || 3,
      initialDelay: config.initialRetryDelay || 1000,
      maxDelay: config.maxRetryDelay || 10000,
      backoffFactor: config.retryBackoffFactor || 2
    };
    this.connectionPool = new Map();
    this.maxPoolSize = config.maxPoolSize || 5;
  }

  /**
   * Get a pooled MCP connection
   */
  async getPooledConnection() {
    const poolKey = `bigquery_${this.dataset}`;
    
    if (this.connectionPool.has(poolKey)) {
      const connection = this.connectionPool.get(poolKey);
      if (this.isConnectionValid(connection)) {
        return connection;
      }
    }

    // Create new connection
    const connection = await getBigQueryTools();
    connection.createdAt = Date.now();
    
    // Add to pool if under limit
    if (this.connectionPool.size < this.maxPoolSize) {
      this.connectionPool.set(poolKey, connection);
    }

    return connection;
  }

  /**
   * Check if connection is still valid (less than 5 minutes old)
   */
  isConnectionValid(connection) {
    const maxAge = 5 * 60 * 1000; // 5 minutes
    return connection && (Date.now() - connection.createdAt) < maxAge;
  }

  /**
   * Execute query with retry logic and connection pooling
   */
  async executeQueryWithRetry(query, options = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const { client } = await this.getPooledConnection();
        const result = await executeQuery(client, query);
        
        // Log successful query
        if (options.logQuery) {
          logger.debug('Query executed successfully', {
            attempt,
            rowCount: result.length,
            query: query.substring(0, 200) + '...'
          });
        }
        
        return result;
      } catch (error) {
        lastError = error;
        
        // Check if error is retryable
        if (!this.isRetryableError(error) || attempt === this.retryConfig.maxRetries) {
          throw error;
        }
        
        // Calculate delay with exponential backoff
        const delay = Math.min(
          this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffFactor, attempt - 1),
          this.retryConfig.maxDelay
        );
        
        logger.warn(`Query failed, retrying in ${delay}ms`, {
          attempt,
          error: error.message,
          query: query.substring(0, 100) + '...'
        });
        
        await this.delay(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Insert rows with retry logic
   */
  async insertRowsWithRetry(table, rows, options = {}) {
    let lastError;
    
    for (let attempt = 1; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const { client } = await this.getPooledConnection();
        await insertRows(client, table, rows);
        
        logger.info('Rows inserted successfully', {
          table,
          rowCount: rows.length,
          attempt
        });
        
        return;
      } catch (error) {
        lastError = error;
        
        if (!this.isRetryableError(error) || attempt === this.retryConfig.maxRetries) {
          throw error;
        }
        
        const delay = Math.min(
          this.retryConfig.initialDelay * Math.pow(this.retryConfig.backoffFactor, attempt - 1),
          this.retryConfig.maxDelay
        );
        
        logger.warn(`Insert failed, retrying in ${delay}ms`, {
          attempt,
          error: error.message,
          table,
          rowCount: rows.length
        });
        
        await this.delay(delay);
      }
    }
    
    throw lastError;
  }

  /**
   * Check if error is retryable
   */
  isRetryableError(error) {
    const retryableErrors = [
      'RATE_LIMIT_EXCEEDED',
      'TIMEOUT',
      'INTERNAL_ERROR',
      'SERVICE_UNAVAILABLE',
      'DEADLINE_EXCEEDED'
    ];
    
    return retryableErrors.some(code => 
      error.message?.includes(code) || error.code === code
    );
  }

  /**
   * Delay helper
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Cash Clearing Specific Methods
   */

  /**
   * Get unprocessed cash transactions
   */
  async getUnprocessedTransactions(limit = 100, offset = 0) {
    const query = this.queryBuilder
      .getCashTransactionsWithPattern('T_NOTFOUND', limit, offset)
      .build();
    
    return await this.executeQueryWithRetry(query, { logQuery: true });
  }

  /**
   * Get active processor patterns
   */
  async getActiveProcessorPatterns(customerAccount = null, typeCode = null) {
    const query = this.queryBuilder
      .getActiveProcessorPatterns(customerAccount, typeCode)
      .build();
    
    return await this.executeQueryWithRetry(query);
  }

  /**
   * Get GL patterns for a specific pattern
   */
  async getGLPatternsForPattern(patternOp, customerAccount = null, typeCode = null) {
    const query = this.queryBuilder
      .getGLPatternsForPattern(patternOp, customerAccount, typeCode)
      .build();
    
    return await this.executeQueryWithRetry(query);
  }

  /**
   * Insert cash clearing suggestions in batch
   */
  async insertCashClearingSuggestions(suggestions) {
    const table = `${this.dataset}.ai_cash_clearing_suggestions`;
    
    // Transform suggestions to match table schema
    const rows = suggestions.map(s => ({
      bt_id: s.bt_id || s.transaction_id,
      transaction_id: s.transaction_id,
      workflow_step: s.workflow_step || 4,
      
      // AI fields
      AI_SUGGEST_TEXT: s.pattern_matched || s.AI_SUGGEST_TEXT,
      AI_CONFIDENCE_SCORE: s.confidence_score || s.AI_CONFIDENCE_SCORE,
      AI_REASON: JSON.stringify(s.reasoning) || s.AI_REASON,
      AI_GL_ACCOUNT: s.gl_account_code || s.AI_GL_ACCOUNT,
      AI_PRCSSR_PTRN_FT: s.ft_id || s.AI_PRCSSR_PTRN_FT,
      
      // Standard fields
      pattern_matched: s.pattern_matched,
      gl_account_code: s.gl_account_code,
      gl_account_name: s.gl_account_name,
      debit_credit_indicator: s.debit_credit_indicator,
      amount: s.amount,
      confidence_score: s.confidence_score,
      reasoning: JSON.stringify(s.reasoning),
      approval_status: s.approval_status || 'PENDING',
      processing_batch_id: s.processing_batch_id,
      ai_model: s.ai_model,
      processing_time_ms: s.processing_time_ms,
      validation_checks: JSON.stringify(s.validation_checks),
      metadata: JSON.stringify(s.metadata || {}),
      UPDATED_AT: new Date().toISOString()
    }));
    
    await this.insertRowsWithRetry(table, rows);
    return rows.length;
  }

  /**
   * Update workflow state
   */
  async updateWorkflowState(workflowId, updates) {
    const setClause = Object.entries(updates)
      .map(([key, value]) => {
        if (value instanceof Date) {
          return `${key} = TIMESTAMP('${value.toISOString()}')`;
        } else if (typeof value === 'string') {
          return `${key} = '${value.replace(/'/g, "''")}'`;
        } else if (value === null) {
          return `${key} = NULL`;
        } else {
          return `${key} = ${value}`;
        }
      })
      .join(', ');
    
    const query = `
      UPDATE ${this.dataset}.cash_clearing_workflow_state 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP()
      WHERE workflow_id = '${workflowId}'
    `;
    
    await this.executeQueryWithRetry(query);
  }

  /**
   * Insert audit log entry
   */
  async insertAuditLogEntry(entry) {
    const table = `${this.dataset}.cash_clearing_audit_log`;
    
    const row = {
      workflow_id: entry.workflow_id,
      transaction_id: entry.transaction_id,
      step_number: entry.step_number,
      action_type: entry.action_type,
      action_details: JSON.stringify(entry.action_details || {}),
      user_id: entry.user_id,
      ai_model: entry.ai_model,
      confidence_score: entry.confidence_score,
      processing_time_ms: entry.processing_time_ms,
      input_data: JSON.stringify(entry.input_data || {}),
      output_data: JSON.stringify(entry.output_data || {}),
      error_details: JSON.stringify(entry.error_details || {})
    };
    
    await this.insertRowsWithRetry(table, [row]);
  }

  /**
   * Get pending approvals
   */
  async getPendingApprovals(batchId = null, limit = 100) {
    let query = `
      SELECT 
        s.*,
        t.customer_account_number,
        t.type_code,
        t.text as transaction_text,
        t.transaction_date
      FROM ${this.dataset}.ai_cash_clearing_suggestions s
      JOIN ${this.dataset}.cash_transactions t ON s.bt_id = t.bt_id
      WHERE s.approval_status = 'PENDING'
    `;
    
    if (batchId) {
      query += ` AND s.processing_batch_id = '${batchId}'`;
    }
    
    query += ` ORDER BY s.created_at DESC LIMIT ${limit}`;
    
    return await this.executeQueryWithRetry(query);
  }

  /**
   * Approve transaction suggestion
   */
  async approveSuggestion(suggestionId, approvedBy, reason = null) {
    const metadata = reason ? { approval_reason: reason } : {};
    
    const query = `
      UPDATE ${this.dataset}.ai_cash_clearing_suggestions
      SET 
        approval_status = 'APPROVED',
        approved_by = '${approvedBy}',
        approved_at = CURRENT_TIMESTAMP(),
        metadata = JSON_MERGE_PATCH(IFNULL(metadata, JSON '{}'), JSON '${JSON.stringify(metadata)}'),
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE suggestion_id = '${suggestionId}'
    `;
    
    await this.executeQueryWithRetry(query);
  }

  /**
   * Reject transaction suggestion
   */
  async rejectSuggestion(suggestionId, rejectedBy, reason) {
    const metadata = { rejection_reason: reason };
    
    const query = `
      UPDATE ${this.dataset}.ai_cash_clearing_suggestions
      SET 
        approval_status = 'REJECTED',
        approved_by = '${rejectedBy}',
        approved_at = CURRENT_TIMESTAMP(),
        metadata = JSON_MERGE_PATCH(IFNULL(metadata, JSON '{}'), JSON '${JSON.stringify(metadata)}'),
        UPDATED_AT = CURRENT_TIMESTAMP()
      WHERE suggestion_id = '${suggestionId}'
    `;
    
    await this.executeQueryWithRetry(query);
  }

  /**
   * Get workflow status
   */
  async getWorkflowStatus(batchId) {
    const query = `
      SELECT 
        w.*,
        COUNT(DISTINCT s.suggestion_id) as total_suggestions,
        COUNT(DISTINCT CASE WHEN s.approval_status = 'PENDING' THEN s.suggestion_id END) as pending_approvals,
        COUNT(DISTINCT CASE WHEN s.approval_status = 'APPROVED' THEN s.suggestion_id END) as approved_suggestions,
        COUNT(DISTINCT CASE WHEN s.approval_status = 'REJECTED' THEN s.suggestion_id END) as rejected_suggestions
      FROM ${this.dataset}.cash_clearing_workflow_state w
      LEFT JOIN ${this.dataset}.ai_cash_clearing_suggestions s 
        ON s.processing_batch_id = w.batch_id
      WHERE w.batch_id = '${batchId}'
      GROUP BY w.workflow_id, w.batch_id, w.current_step, w.total_transactions, 
               w.processed_transactions, w.failed_transactions, w.workflow_status,
               w.human_approval_required, w.created_at, w.updated_at
    `;
    
    const results = await this.executeQueryWithRetry(query);
    return results[0] || null;
  }

  /**
   * Get processing metrics
   */
  async getProcessingMetrics(startDate, endDate) {
    const query = `
      SELECT 
        DATE(created_at) as processing_date,
        COUNT(DISTINCT workflow_id) as workflows_run,
        SUM(total_transactions) as total_transactions,
        SUM(processed_transactions) as processed_transactions,
        SUM(failed_transactions) as failed_transactions,
        AVG(TIMESTAMP_DIFF(step_4_completed_at, created_at, SECOND)) as avg_processing_time_seconds,
        COUNT(DISTINCT CASE WHEN workflow_status = 'COMPLETED' THEN workflow_id END) as completed_workflows,
        COUNT(DISTINCT CASE WHEN workflow_status = 'FAILED' THEN workflow_id END) as failed_workflows
      FROM ${this.dataset}.cash_clearing_workflow_state
      WHERE DATE(created_at) BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY processing_date
      ORDER BY processing_date DESC
    `;
    
    return await this.executeQueryWithRetry(query);
  }

  /**
   * Clean up old connections from pool
   */
  cleanupConnectionPool() {
    for (const [key, connection] of this.connectionPool.entries()) {
      if (!this.isConnectionValid(connection)) {
        this.connectionPool.delete(key);
      }
    }
  }

  /**
   * Close all connections
   */
  async closeAllConnections() {
    this.connectionPool.clear();
    logger.info('All MCP connections closed');
  }
}

/**
 * Create singleton instance
 */
let mcpClientInstance;

export function getCashClearingMcpClient(config = {}) {
  if (!mcpClientInstance) {
    mcpClientInstance = new CashClearingMcpClient(config);
  }
  return mcpClientInstance;
}

/**
 * Export convenience methods
 */
export const cashClearingMcp = {
  getUnprocessedTransactions: async (limit, offset) => {
    const client = getCashClearingMcpClient();
    return await client.getUnprocessedTransactions(limit, offset);
  },
  
  getActivePatterns: async (customerAccount, typeCode) => {
    const client = getCashClearingMcpClient();
    return await client.getActiveProcessorPatterns(customerAccount, typeCode);
  },
  
  getGLMappings: async (patternOp, customerAccount, typeCode) => {
    const client = getCashClearingMcpClient();
    return await client.getGLPatternsForPattern(patternOp, customerAccount, typeCode);
  },
  
  insertSuggestions: async (suggestions) => {
    const client = getCashClearingMcpClient();
    return await client.insertCashClearingSuggestions(suggestions);
  },
  
  getPendingApprovals: async (batchId, limit) => {
    const client = getCashClearingMcpClient();
    return await client.getPendingApprovals(batchId, limit);
  },
  
  approveSuggestion: async (suggestionId, approvedBy, reason) => {
    const client = getCashClearingMcpClient();
    return await client.approveSuggestion(suggestionId, approvedBy, reason);
  },
  
  rejectSuggestion: async (suggestionId, rejectedBy, reason) => {
    const client = getCashClearingMcpClient();
    return await client.rejectSuggestion(suggestionId, rejectedBy, reason);
  },
  
  getWorkflowStatus: async (batchId) => {
    const client = getCashClearingMcpClient();
    return await client.getWorkflowStatus(batchId);
  }
};