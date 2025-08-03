/**
 * Cash Clearing Query Builder
 * Provides a fluent interface for building BigQuery queries
 */

export class CashClearingQueryBuilder {
  constructor(dataset = 'ksingamsetty-test.AI_POC') {
    this.dataset = dataset;
    this.query = '';
    this.params = {};
  }

  /**
   * Reset the query builder
   */
  reset() {
    this.query = '';
    this.params = {};
    return this;
  }

  /**
   * Get cash transactions with specific pattern
   */
  getCashTransactionsWithPattern(pattern, limit = 100, offset = 0) {
    this.query = `
      SELECT 
        bt_id,
        customer_account_number,
        type_code,
        text,
        pattern,
        amount,
        transaction_date,
        currency_code,
        source_system,
        batch_id,
        created_at
      FROM ${this.dataset}.cash_transactions
      WHERE pattern = '${pattern}'
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
    
    if (offset > 0) {
      this.query += ` OFFSET ${offset}`;
    }
    
    return this;
  }

  /**
   * Get active processor patterns
   */
  getActiveProcessorPatterns(customerAccount = null, typeCode = null) {
    let whereClause = 'WHERE is_active = true';
    
    if (customerAccount) {
      whereClause += ` AND (customer_account_number = '${customerAccount}' OR customer_account_number IS NULL)`;
    }
    
    if (typeCode) {
      whereClause += ` AND (type_code = '${typeCode}' OR type_code IS NULL)`;
    }
    
    this.query = `
      SELECT 
        pattern_id,
        pattern_search,
        pattern_op,
        pattern_type,
        pattern_regex,
        confidence_weight,
        priority_order,
        customer_account_number,
        type_code,
        metadata
      FROM ${this.dataset}.cash_processor_patterns
      ${whereClause}
      ORDER BY priority_order ASC, confidence_weight DESC
    `;
    
    return this;
  }

  /**
   * Get GL patterns for a specific pattern
   */
  getGLPatternsForPattern(patternOp, customerAccount = null, typeCode = null) {
    let whereClause = `WHERE pattern = '${patternOp}' AND is_active = true`;
    
    if (customerAccount) {
      whereClause += ` AND (customer_account_number = '${customerAccount}' OR customer_account_number IS NULL)`;
    }
    
    if (typeCode) {
      whereClause += ` AND (type_code = '${typeCode}' OR type_code IS NULL)`;
    }
    
    this.query = `
      SELECT 
        gl_pattern_id,
        pattern,
        GL_ACCOUNT,
        FT_ID,
        gl_account_name,
        debit_credit_indicator,
        account_category,
        business_unit,
        cost_center,
        mapping_confidence,
        auto_approve_threshold,
        requires_approval,
        customer_account_number,
        type_code,
        metadata
      FROM ${this.dataset}.cash_gl_patterns
      ${whereClause}
      ORDER BY mapping_confidence DESC
    `;
    
    return this;
  }

  /**
   * Get pending approvals
   */
  getPendingApprovals(batchId = null) {
    let whereClause = "WHERE approval_status = 'PENDING'";
    
    if (batchId) {
      whereClause += ` AND processing_batch_id = '${batchId}'`;
    }
    
    this.query = `
      SELECT 
        suggestion_id,
        bt_id,
        transaction_id,
        pattern_matched,
        gl_account_code,
        gl_account_name,
        debit_credit_indicator,
        amount,
        confidence_score,
        AI_SUGGEST_TEXT,
        AI_CONFIDENCE_SCORE,
        AI_REASON,
        AI_GL_ACCOUNT,
        AI_PRCSSR_PTRN_FT,
        reasoning,
        validation_checks,
        processing_batch_id,
        created_at
      FROM ${this.dataset}.ai_cash_clearing_suggestions
      ${whereClause}
      ORDER BY created_at DESC
    `;
    
    return this;
  }

  /**
   * Get workflow state
   */
  getWorkflowState(batchId) {
    this.query = `
      SELECT 
        workflow_id,
        batch_id,
        current_step,
        total_transactions,
        processed_transactions,
        failed_transactions,
        step_1_completed_at,
        step_2_completed_at,
        step_3_completed_at,
        step_4_completed_at,
        human_approval_required,
        approval_checkpoint_step,
        workflow_status,
        error_details,
        metadata,
        created_at,
        updated_at
      FROM ${this.dataset}.cash_clearing_workflow_state
      WHERE batch_id = '${batchId}'
      ORDER BY created_at DESC
      LIMIT 1
    `;
    
    return this;
  }

  /**
   * Update workflow state
   */
  updateWorkflowState(workflowId, updates) {
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
    
    this.query = `
      UPDATE ${this.dataset}.cash_clearing_workflow_state 
      SET ${setClause}, updated_at = CURRENT_TIMESTAMP()
      WHERE workflow_id = '${workflowId}'
    `;
    
    return this;
  }

  /**
   * Insert cash clearing suggestions
   */
  insertCashClearingSuggestions(suggestions) {
    return {
      table: `${this.dataset}.ai_cash_clearing_suggestions`,
      rows: suggestions
    };
  }

  /**
   * Insert audit log
   */
  insertAuditLog(entry) {
    return {
      table: `${this.dataset}.cash_clearing_audit_log`,
      rows: [entry]
    };
  }

  /**
   * Get transaction details with suggestions
   */
  getTransactionWithSuggestions(transactionId) {
    this.query = `
      SELECT 
        t.*,
        s.suggestion_id,
        s.pattern_matched,
        s.gl_account_code,
        s.gl_account_name,
        s.confidence_score,
        s.approval_status,
        s.AI_SUGGEST_TEXT,
        s.AI_CONFIDENCE_SCORE,
        s.AI_REASON,
        s.reasoning
      FROM ${this.dataset}.cash_transactions t
      LEFT JOIN ${this.dataset}.ai_cash_clearing_suggestions s
        ON t.bt_id = s.bt_id
      WHERE t.bt_id = '${transactionId}'
    `;
    
    return this;
  }

  /**
   * Get workflow metrics
   */
  getWorkflowMetrics(startDate, endDate) {
    this.query = `
      SELECT 
        DATE(created_at) as date,
        COUNT(DISTINCT workflow_id) as workflows,
        SUM(total_transactions) as total_transactions,
        SUM(processed_transactions) as processed_transactions,
        AVG(TIMESTAMP_DIFF(
          COALESCE(step_4_completed_at, step_3_completed_at, step_2_completed_at, step_1_completed_at),
          created_at,
          SECOND
        )) as avg_processing_seconds,
        COUNT(DISTINCT CASE WHEN workflow_status = 'COMPLETED' THEN workflow_id END) as completed,
        COUNT(DISTINCT CASE WHEN workflow_status = 'FAILED' THEN workflow_id END) as failed
      FROM ${this.dataset}.cash_clearing_workflow_state
      WHERE DATE(created_at) BETWEEN '${startDate}' AND '${endDate}'
      GROUP BY date
      ORDER BY date DESC
    `;
    
    return this;
  }

  /**
   * Get pattern usage statistics
   */
  getPatternUsageStats(days = 30) {
    this.query = `
      SELECT 
        s.pattern_matched,
        COUNT(*) as usage_count,
        AVG(s.confidence_score) as avg_confidence,
        COUNT(DISTINCT s.bt_id) as unique_transactions,
        COUNT(CASE WHEN s.approval_status = 'APPROVED' THEN 1 END) as approved_count,
        COUNT(CASE WHEN s.approval_status = 'REJECTED' THEN 1 END) as rejected_count,
        COUNT(CASE WHEN s.approval_status = 'AUTO_APPROVED' THEN 1 END) as auto_approved_count
      FROM ${this.dataset}.ai_cash_clearing_suggestions s
      WHERE DATE(s.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
      GROUP BY s.pattern_matched
      ORDER BY usage_count DESC
    `;
    
    return this;
  }

  /**
   * Get GL account usage statistics
   */
  getGLAccountUsageStats(days = 30) {
    this.query = `
      SELECT 
        s.gl_account_code,
        s.gl_account_name,
        COUNT(*) as usage_count,
        SUM(s.amount) as total_amount,
        AVG(s.amount) as avg_amount,
        COUNT(DISTINCT s.pattern_matched) as unique_patterns,
        AVG(s.confidence_score) as avg_confidence
      FROM ${this.dataset}.ai_cash_clearing_suggestions s
      WHERE DATE(s.created_at) >= DATE_SUB(CURRENT_DATE(), INTERVAL ${days} DAY)
        AND s.approval_status IN ('APPROVED', 'AUTO_APPROVED')
      GROUP BY s.gl_account_code, s.gl_account_name
      ORDER BY usage_count DESC
    `;
    
    return this;
  }

  /**
   * Build the query
   */
  build() {
    return this.query.trim();
  }

  /**
   * Get parameters
   */
  getParams() {
    return this.params;
  }
}

/**
 * Factory function to create query builder
 */
export function createCashClearingQueryBuilder(dataset) {
  return new CashClearingQueryBuilder(dataset);
}

/**
 * Utility functions for common queries
 */
export const cashClearingQueries = {
  /**
   * Get summary statistics for a batch
   */
  getBatchSummary: (dataset, batchId) => {
    return `
      SELECT 
        COUNT(DISTINCT s.suggestion_id) as total_suggestions,
        COUNT(DISTINCT CASE WHEN s.approval_status = 'PENDING' THEN s.suggestion_id END) as pending,
        COUNT(DISTINCT CASE WHEN s.approval_status = 'APPROVED' THEN s.suggestion_id END) as approved,
        COUNT(DISTINCT CASE WHEN s.approval_status = 'REJECTED' THEN s.suggestion_id END) as rejected,
        COUNT(DISTINCT CASE WHEN s.approval_status = 'AUTO_APPROVED' THEN s.suggestion_id END) as auto_approved,
        SUM(s.amount) as total_amount,
        AVG(s.confidence_score) as avg_confidence,
        MIN(s.confidence_score) as min_confidence,
        MAX(s.confidence_score) as max_confidence
      FROM ${dataset}.ai_cash_clearing_suggestions s
      WHERE s.processing_batch_id = '${batchId}'
    `;
  },

  /**
   * Get approval queue for a user
   */
  getUserApprovalQueue: (dataset, userId, limit = 50) => {
    return `
      SELECT 
        s.*,
        t.customer_account_number,
        t.type_code,
        t.text as transaction_text,
        t.transaction_date
      FROM ${dataset}.ai_cash_clearing_suggestions s
      JOIN ${dataset}.cash_transactions t ON s.bt_id = t.bt_id
      WHERE s.approval_status = 'PENDING'
        AND s.confidence_score < s.auto_approve_threshold
      ORDER BY s.amount DESC, s.created_at ASC
      LIMIT ${limit}
    `;
  },

  /**
   * Get recent audit log entries
   */
  getRecentAuditLog: (dataset, workflowId = null, limit = 100) => {
    let whereClause = '';
    if (workflowId) {
      whereClause = `WHERE workflow_id = '${workflowId}'`;
    }
    
    return `
      SELECT 
        audit_id,
        workflow_id,
        transaction_id,
        step_number,
        action_type,
        action_details,
        user_id,
        ai_model,
        confidence_score,
        processing_time_ms,
        created_at
      FROM ${dataset}.cash_clearing_audit_log
      ${whereClause}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `;
  }
};