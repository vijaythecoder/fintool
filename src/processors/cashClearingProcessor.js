import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { FinancialProcessor } from './financialProcessor.js';
import { getBigQueryTools, executeQuery, insertRows } from '../services/mcpClient.js';
import { logger, logTransaction, logPerformance } from '../utils/logger.js';
import { createCashClearingQueryBuilder } from '../utils/queryBuilder.js';
import { processBatches } from '../utils/chunks.js';
import { format } from 'date-fns';

/**
 * CashClearingProcessor - Implements the 4-step cash clearing workflow
 * 
 * Step 1: Query cash_transactions where pattern = 'T_NOTFOUND'
 * Step 2: Pattern matching using cash_processor_patterns
 * Step 3: GL account lookup from cash_gl_patterns  
 * Step 4: Insert results to ai_cash_clearing_suggestions
 */
export class CashClearingProcessor extends FinancialProcessor {
  constructor(options = {}) {
    super(options);
    this.workflowSteps = this.initializeWorkflowSteps();
    this.queryBuilder = createCashClearingQueryBuilder(this.dataset);
    this.approvalThreshold = options.approvalThreshold || 0.9;
    this.requireHumanApproval = options.requireHumanApproval !== false; // default true
    this.maxConcurrentSteps = options.maxConcurrentSteps || 1;
    this.enableAuditLog = options.enableAuditLog !== false; // default true
  }

  initializeWorkflowSteps() {
    return [
      {
        stepNumber: 1,
        stepName: 'Query Cash Transactions',
        description: 'Retrieve unprocessed cash transactions with T_NOTFOUND pattern',
        requiredApproval: false,
        autoApproveThreshold: 1.0,
        timeoutMs: 30000
      },
      {
        stepNumber: 2,
        stepName: 'Pattern Matching',
        description: 'Apply processor patterns to identify transaction types',
        requiredApproval: false,
        autoApproveThreshold: 0.8,
        timeoutMs: 60000
      },
      {
        stepNumber: 3,
        stepName: 'GL Account Mapping',
        description: 'Map patterns to GL accounts and determine posting logic',
        requiredApproval: true,
        autoApproveThreshold: 0.95,
        timeoutMs: 45000
      },
      {
        stepNumber: 4,
        stepName: 'Generate Suggestions',
        description: 'Create and store cash clearing suggestions',
        requiredApproval: false,
        autoApproveThreshold: 0.9,
        timeoutMs: 30000
      }
    ];
  }

  /**
   * Main workflow execution
   */
  async executeCashClearingWorkflow(options = {}) {
    const startTime = Date.now();
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    logger.info('Starting cash clearing workflow', { batchId, options });

    try {
      const { client, tools } = await getBigQueryTools();
      
      // Initialize workflow state
      const workflowState = await this.initializeWorkflowState(client, batchId, options);
      
      // Execute 4-step workflow
      const results = await this.executeWorkflowSteps(client, tools, workflowState);
      
      // Finalize workflow
      await this.finalizeWorkflow(client, workflowState, results);
      
      const totalTime = Date.now() - startTime;
      logger.info('Cash clearing workflow completed', { 
        batchId, 
        totalTime, 
        results: results.summary 
      });

      return {
        workflowId: workflowState.workflow_id,
        batchId,
        results,
        processingTimeMs: totalTime
      };

    } catch (error) {
      logger.error('Cash clearing workflow failed', { batchId, error: error.message });
      await this.handleWorkflowError(batchId, error);
      throw error;
    }
  }

  /**
   * Initialize workflow state in BigQuery
   */
  async initializeWorkflowState(client, batchId, options) {
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    const workflowState = {
      workflow_id: workflowId,
      batch_id: batchId,
      current_step: 1,
      total_transactions: 0,
      processed_transactions: 0,
      failed_transactions: 0,
      human_approval_required: this.requireHumanApproval,
      workflow_status: 'RUNNING',
      metadata: JSON.stringify(options)
    };

    await insertRows(client, `${this.dataset}.cash_clearing_workflow_state`, [workflowState]);
    
    if (this.enableAuditLog) {
      await this.logAuditEntry(client, {
        workflow_id: workflowId,
        step_number: 0,
        action_type: 'WORKFLOW_STARTED',
        action_details: { batchId, options }
      });
    }

    return { ...workflowState, workflow_id: workflowId };
  }

  /**
   * Execute the 4-step workflow
   */
  async executeWorkflowSteps(client, tools, workflowState) {
    const stepResults = {
      step1: { completed: false, count: 0, timeMs: 0, data: [] },
      step2: { completed: false, count: 0, timeMs: 0, data: [] },
      step3: { completed: false, count: 0, timeMs: 0, data: [] },
      step4: { completed: false, count: 0, timeMs: 0, data: [] }
    };

    // Step 1: Query Cash Transactions
    const step1Result = await this.executeStep1(client, workflowState);
    stepResults.step1 = step1Result;
    
    if (step1Result.data.length === 0) {
      logger.info('No transactions found for processing', { batchId: workflowState.batch_id });
      return { stepResults, summary: { totalProcessed: 0 } };
    }

    // Update total transactions count
    await this.updateWorkflowState(client, workflowState.workflow_id, {
      total_transactions: step1Result.data.length,
      step_1_completed_at: new Date()
    });

    // Step 2: Pattern Matching
    const step2Result = await this.executeStep2(client, tools, step1Result.data, workflowState);
    stepResults.step2 = step2Result;

    await this.updateWorkflowState(client, workflowState.workflow_id, {
      current_step: 3,
      step_2_completed_at: new Date()
    });

    // Step 3: GL Account Mapping
    const step3Result = await this.executeStep3(client, tools, step2Result.data, workflowState);
    stepResults.step3 = step3Result;

    // Human approval checkpoint if required
    if (this.requireHumanApproval && step3Result.requiresApproval) {
      await this.handleApprovalCheckpoint(client, workflowState, step3Result);
    }

    await this.updateWorkflowState(client, workflowState.workflow_id, {
      current_step: 4,
      step_3_completed_at: new Date()
    });

    // Step 4: Generate and Store Suggestions
    const step4Result = await this.executeStep4(client, tools, step3Result.data, workflowState);
    stepResults.step4 = step4Result;

    await this.updateWorkflowState(client, workflowState.workflow_id, {
      current_step: 4,
      processed_transactions: step4Result.count,
      step_4_completed_at: new Date(),
      workflow_status: 'COMPLETED'
    });

    return {
      stepResults,
      summary: {
        totalProcessed: step4Result.count,
        totalTime: Object.values(stepResults).reduce((sum, step) => sum + step.timeMs, 0),
        avgConfidence: this.calculateAverageConfidence(step4Result.data)
      }
    };
  }

  /**
   * Step 1: Query cash transactions with T_NOTFOUND pattern
   */
  async executeStep1(client, workflowState) {
    const stepStartTime = Date.now();
    
    try {
      logger.info('Executing Step 1: Query Cash Transactions', { 
        batchId: workflowState.batch_id 
      });

      const query = this.queryBuilder
        .getCashTransactionsWithPattern('T_NOTFOUND', this.batchSize)
        .build();

      const transactions = await executeQuery(client, query);
      
      if (this.enableAuditLog) {
        await this.logAuditEntry(client, {
          workflow_id: workflowState.workflow_id,
          step_number: 1,
          action_type: 'QUERY',
          action_details: { transactionCount: transactions.length },
          input_data: { query },
          output_data: { count: transactions.length }
        });
      }

      return {
        completed: true,
        count: transactions.length,
        timeMs: Date.now() - stepStartTime,
        data: transactions
      };

    } catch (error) {
      logger.error('Step 1 failed', { error: error.message, batchId: workflowState.batch_id });
      throw new Error(`Step 1 failed: ${error.message}`);
    }
  }

  /**
   * Step 2: Pattern matching using processor patterns
   */
  async executeStep2(client, tools, transactions, workflowState) {
    const stepStartTime = Date.now();
    
    try {
      logger.info('Executing Step 2: Pattern Matching', { 
        batchId: workflowState.batch_id,
        transactionCount: transactions.length
      });

      // Get active processor patterns
      const patternsQuery = this.queryBuilder.getActiveProcessorPatterns().build();
      const patterns = await executeQuery(client, patternsQuery);

      // Process transactions in batches
      const matchedTransactions = await processBatches(
        transactions,
        this.batchSize,
        async (batch) => {
          return await this.matchTransactionPatterns(batch, patterns, tools, workflowState);
        },
        {
          concurrency: this.concurrency,
          onProgress: (processed, total) => {
            logger.debug(`Pattern matching progress: ${processed}/${total}`, {
              batchId: workflowState.batch_id
            });
          }
        }
      );

      const flattenedResults = matchedTransactions.flat();

      if (this.enableAuditLog) {
        await this.logAuditEntry(client, {
          workflow_id: workflowState.workflow_id,
          step_number: 2,
          action_type: 'MATCH',
          action_details: { 
            patternsUsed: patterns.length,
            matchedTransactions: flattenedResults.length
          },
          processing_time_ms: Date.now() - stepStartTime
        });
      }

      return {
        completed: true,
        count: flattenedResults.length,
        timeMs: Date.now() - stepStartTime,
        data: flattenedResults
      };

    } catch (error) {
      logger.error('Step 2 failed', { error: error.message, batchId: workflowState.batch_id });
      throw new Error(`Step 2 failed: ${error.message}`);
    }
  }

  /**
   * Match transactions against patterns using AI
   */
  async matchTransactionPatterns(transactions, patterns, tools, workflowState) {
    const result = await generateText({
      model: openai(this.model),
      messages: [
        {
          role: 'system',
          content: this.buildPatternMatchingPrompt(patterns)
        },
        {
          role: 'user',
          content: JSON.stringify({
            transactions,
            workflow: { batchId: workflowState.batch_id }
          })
        }
      ],
      tools,
      temperature: 0.1,
      responseFormat: { type: 'json' }
    });

    const aiResponse = JSON.parse(result.text);
    
    return transactions.map(transaction => ({
      ...transaction,
      matched_patterns: aiResponse.matches?.[transaction.transaction_id] || [],
      confidence_scores: aiResponse.confidences?.[transaction.transaction_id] || {},
      ai_reasoning: aiResponse.reasoning?.[transaction.transaction_id] || 'No pattern match found'
    }));
  }

  /**
   * Step 3: GL account mapping
   */
  async executeStep3(client, tools, matchedTransactions, workflowState) {
    const stepStartTime = Date.now();
    
    try {
      logger.info('Executing Step 3: GL Account Mapping', { 
        batchId: workflowState.batch_id,
        transactionCount: matchedTransactions.length
      });

      const mappedTransactions = await processBatches(
        matchedTransactions,
        this.batchSize,
        async (batch) => {
          return await this.mapGLAccounts(client, batch, tools, workflowState);
        },
        {
          concurrency: this.concurrency,
          onProgress: (processed, total) => {
            logger.debug(`GL mapping progress: ${processed}/${total}`, {
              batchId: workflowState.batch_id
            });
          }
        }
      );

      const flattenedResults = mappedTransactions.flat();
      const requiresApproval = flattenedResults.some(tx => 
        tx.gl_mapping && tx.gl_mapping.requires_approval && 
        tx.gl_mapping.confidence < this.approvalThreshold
      );

      if (this.enableAuditLog) {
        await this.logAuditEntry(client, {
          workflow_id: workflowState.workflow_id,
          step_number: 3,
          action_type: 'GL_MAPPING',
          action_details: { 
            mappedTransactions: flattenedResults.length,
            requiresApproval
          },
          processing_time_ms: Date.now() - stepStartTime
        });
      }

      return {
        completed: true,
        count: flattenedResults.length,
        timeMs: Date.now() - stepStartTime,
        data: flattenedResults,
        requiresApproval
      };

    } catch (error) {
      logger.error('Step 3 failed', { error: error.message, batchId: workflowState.batch_id });
      throw new Error(`Step 3 failed: ${error.message}`);
    }
  }

  /**
   * Map GL accounts for matched patterns
   */
  async mapGLAccounts(client, transactions, tools, workflowState) {
    const results = [];

    for (const transaction of transactions) {
      if (!transaction.matched_patterns || transaction.matched_patterns.length === 0) {
        results.push({
          ...transaction,
          gl_mapping: null,
          mapping_status: 'NO_PATTERN_MATCH'
        });
        continue;
      }

      // Get GL patterns for the best matched pattern
      const bestPattern = transaction.matched_patterns[0]; // Assuming sorted by confidence
      const glQuery = this.queryBuilder
        .getGLPatternsForPattern(bestPattern.pattern_id)
        .build();
      
      const glPatterns = await executeQuery(client, glQuery);

      if (glPatterns.length === 0) {
        results.push({
          ...transaction,
          gl_mapping: null,
          mapping_status: 'NO_GL_MAPPING'
        });
        continue;
      }

      // Use AI to select the best GL mapping
      const aiGLMapping = await this.selectOptimalGLMapping(
        transaction, 
        glPatterns, 
        tools, 
        workflowState
      );

      results.push({
        ...transaction,
        gl_mapping: aiGLMapping,
        mapping_status: 'MAPPED'
      });
    }

    return results;
  }

  /**
   * Use AI to select optimal GL mapping
   */
  async selectOptimalGLMapping(transaction, glPatterns, tools, workflowState) {
    const result = await generateText({
      model: openai(this.model),
      messages: [
        {
          role: 'system',
          content: this.buildGLMappingPrompt()
        },
        {
          role: 'user',
          content: JSON.stringify({
            transaction,
            availableGLPatterns: glPatterns,
            approvalThreshold: this.approvalThreshold
          })
        }
      ],
      temperature: 0.1,
      responseFormat: { type: 'json' }
    });

    return JSON.parse(result.text);
  }

  /**
   * Step 4: Generate and store suggestions
   */
  async executeStep4(client, tools, mappedTransactions, workflowState) {
    const stepStartTime = Date.now();
    
    try {
      logger.info('Executing Step 4: Generate Suggestions', { 
        batchId: workflowState.batch_id,
        transactionCount: mappedTransactions.length
      });

      const suggestions = mappedTransactions
        .filter(tx => tx.gl_mapping)
        .map(tx => this.createCashClearingSuggestion(tx, workflowState));

      if (suggestions.length > 0) {
        const insertData = this.queryBuilder.insertCashClearingSuggestions(suggestions);
        await insertRows(client, insertData.table, insertData.rows);
      }

      if (this.enableAuditLog) {
        await this.logAuditEntry(client, {
          workflow_id: workflowState.workflow_id,
          step_number: 4,
          action_type: 'SUGGESTIONS_CREATED',
          action_details: { 
            suggestionsCount: suggestions.length
          },
          processing_time_ms: Date.now() - stepStartTime
        });
      }

      return {
        completed: true,
        count: suggestions.length,
        timeMs: Date.now() - stepStartTime,
        data: suggestions
      };

    } catch (error) {
      logger.error('Step 4 failed', { error: error.message, batchId: workflowState.batch_id });
      throw new Error(`Step 4 failed: ${error.message}`);
    }
  }

  /**
   * Create cash clearing suggestion from mapped transaction
   */
  createCashClearingSuggestion(transaction, workflowState) {
    const glMapping = transaction.gl_mapping;
    
    return {
      transaction_id: transaction.transaction_id,
      workflow_step: 4,
      pattern_matched: transaction.matched_patterns?.[0]?.pattern_name,
      gl_account_code: glMapping.gl_account_code,
      gl_account_name: glMapping.gl_account_name,
      debit_credit_indicator: glMapping.debit_credit_indicator,
      amount: transaction.amount,
      confidence_score: glMapping.confidence,
      reasoning: {
        pattern_match_details: transaction.matched_patterns,
        gl_mapping_logic: glMapping,
        ai_analysis: transaction.ai_reasoning,
        validation_checks: this.validateSuggestion(transaction, glMapping)
      },
      approval_status: glMapping.confidence >= this.approvalThreshold ? 'AUTO_APPROVED' : 'PENDING',
      processing_batch_id: workflowState.batch_id,
      ai_model: this.model,
      processing_time_ms: Date.now() - workflowState.created_at
    };
  }

  /**
   * Validate cash clearing suggestion
   */
  validateSuggestion(transaction, glMapping) {
    return {
      amount_positive: transaction.amount > 0,
      gl_account_exists: !!glMapping.gl_account_code,
      debit_credit_valid: ['DR', 'CR'].includes(glMapping.debit_credit_indicator),
      confidence_threshold_met: glMapping.confidence >= this.approvalThreshold,
      pattern_matched: !!transaction.matched_patterns?.length
    };
  }

  /**
   * Handle human approval checkpoint
   */
  async handleApprovalCheckpoint(client, workflowState, stepResult) {
    logger.info('Human approval checkpoint reached', { 
      batchId: workflowState.batch_id,
      requiresApproval: stepResult.requiresApproval
    });

    await this.updateWorkflowState(client, workflowState.workflow_id, {
      human_approval_required: true,
      approval_checkpoint_step: 3,
      workflow_status: 'PAUSED'
    });

    // In a real implementation, this would trigger notifications to approvers
    // For now, we'll log the pending approvals
    const pendingQuery = this.queryBuilder
      .getPendingApprovals(workflowState.batch_id)
      .build();
    
    const pendingApprovals = await executeQuery(client, pendingQuery);
    
    logger.info('Pending approvals created', {
      batchId: workflowState.batch_id,
      pendingCount: pendingApprovals.length
    });
  }

  /**
   * Build system prompts for AI interactions
   */
  buildPatternMatchingPrompt(patterns) {
    return `You are an expert financial transaction pattern matching specialist.

Your task is to analyze cash transactions and match them against predefined patterns to classify transaction types.

Available Patterns:
${patterns.map(p => `- ${p.pattern_name} (${p.pattern_type}): ${p.pattern_regex || 'No regex'} - Weight: ${p.confidence_weight}`).join('\n')}

For each transaction, analyze:
1. Reference number patterns
2. Description content  
3. Amount characteristics
4. Transaction type indicators

Return JSON with:
{
  "matches": {
    "transaction_id": [
      {
        "pattern_id": "matched_pattern_id",
        "pattern_name": "pattern_name", 
        "match_strength": 0.0-1.0,
        "match_details": "explanation"
      }
    ]
  },
  "confidences": {
    "transaction_id": {
      "overall_confidence": 0.0-1.0,
      "pattern_confidence": 0.0-1.0
    }
  },
  "reasoning": {
    "transaction_id": "detailed_explanation"
  }
}

Focus on accuracy and provide clear reasoning for matches.`;
  }

  buildGLMappingPrompt() {
    return `You are an expert financial GL account mapping specialist.

Your task is to select the optimal GL account mapping for a transaction based on:
1. Matched transaction patterns
2. Available GL account options
3. Business rules and confidence thresholds
4. Debit/Credit posting logic

Consider:
- Account category appropriateness (Asset, Liability, Revenue, Expense)
- Business unit and cost center alignment
- Mapping confidence scores
- Auto-approval thresholds

Return JSON with:
{
  "gl_account_code": "selected_account_code",
  "gl_account_name": "account_name",
  "debit_credit_indicator": "DR" or "CR",
  "account_category": "category",
  "confidence": 0.0-1.0,
  "requires_approval": true/false,
  "mapping_reasoning": "detailed_explanation",
  "alternative_mappings": []
}

Prioritize accuracy and compliance with accounting standards.`;
  }

  /**
   * Utility methods
   */
  async updateWorkflowState(client, workflowId, updates) {
    const updateQuery = this.queryBuilder.updateWorkflowState(workflowId, updates);
    await executeQuery(client, updateQuery);
  }

  async logAuditEntry(client, entry) {
    if (!this.enableAuditLog) return;
    
    const auditData = this.queryBuilder.insertAuditLog({
      ...entry,
      ai_model: this.model,
      processing_time_ms: entry.processing_time_ms || 0
    });
    
    await insertRows(client, auditData.table, auditData.rows);
  }

  calculateAverageConfidence(suggestions) {
    if (!suggestions || suggestions.length === 0) return 0;
    
    const totalConfidence = suggestions.reduce((sum, s) => sum + (s.confidence_score || 0), 0);
    return totalConfidence / suggestions.length;
  }

  async finalizeWorkflow(client, workflowState, results) {
    await this.updateWorkflowState(client, workflowState.workflow_id, {
      workflow_status: 'COMPLETED',
      processed_transactions: results.summary.totalProcessed
    });

    if (this.enableAuditLog) {
      await this.logAuditEntry(client, {
        workflow_id: workflowState.workflow_id,
        step_number: 5,
        action_type: 'WORKFLOW_COMPLETED',
        action_details: results.summary
      });
    }
  }

  async handleWorkflowError(batchId, error) {
    logger.error('Handling workflow error', { batchId, error: error.message });
    
    try {
      const { client } = await getBigQueryTools();
      const query = `
        UPDATE ${this.dataset}.cash_clearing_workflow_state 
        SET workflow_status = 'FAILED',
            error_details = JSON '${JSON.stringify({ error: error.message, timestamp: new Date().toISOString() })}',
            updated_at = CURRENT_TIMESTAMP()
        WHERE batch_id = '${batchId}'
      `;
      
      await executeQuery(client, query);
    } catch (updateError) {
      logger.error('Failed to update workflow error state', { updateError: updateError.message });
    }
  }

  /**
   * Public API methods for workflow management
   */
  async getWorkflowStatus(batchId) {
    const { client } = await getBigQueryTools();
    const query = this.queryBuilder.getWorkflowState(batchId).build();
    const results = await executeQuery(client, query);
    return results[0] || null;
  }

  async getPendingApprovals(batchId = null) {
    const { client } = await getBigQueryTools();
    const query = this.queryBuilder.getPendingApprovals(batchId).build();
    return await executeQuery(client, query);
  }

  async approveTransaction(suggestionId, approvedBy, approvalReason = null) {
    const { client } = await getBigQueryTools();
    
    const updateQuery = `
      UPDATE ${this.dataset}.ai_cash_clearing_suggestions
      SET approval_status = 'APPROVED',
          approved_by = '${approvedBy}',
          approved_at = CURRENT_TIMESTAMP(),
          metadata = JSON_SET(IFNULL(metadata, JSON '{}'), '$.approval_reason', '${approvalReason || 'Manual approval'}')
      WHERE suggestion_id = '${suggestionId}'
    `;
    
    await executeQuery(client, updateQuery);
    
    if (this.enableAuditLog) {
      await this.logAuditEntry(client, {
        step_number: 3,
        action_type: 'APPROVE',
        action_details: { suggestionId, approvedBy, approvalReason },
        user_id: approvedBy
      });
    }
  }

  async rejectTransaction(suggestionId, rejectedBy, rejectionReason) {
    const { client } = await getBigQueryTools();
    
    const updateQuery = `
      UPDATE ${this.dataset}.ai_cash_clearing_suggestions
      SET approval_status = 'REJECTED',
          approved_by = '${rejectedBy}',
          approved_at = CURRENT_TIMESTAMP(),
          metadata = JSON_SET(IFNULL(metadata, JSON '{}'), '$.rejection_reason', '${rejectionReason}')
      WHERE suggestion_id = '${suggestionId}'
    `;
    
    await executeQuery(client, updateQuery);
    
    if (this.enableAuditLog) {
      await this.logAuditEntry(client, {
        step_number: 3,
        action_type: 'REJECT',
        action_details: { suggestionId, rejectedBy, rejectionReason },
        user_id: rejectedBy
      });
    }
  }
}