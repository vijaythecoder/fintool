/**
 * Recovery Manager for Cash Clearing Workflow
 * Implements automatic recovery procedures, compensation transactions, and data consistency checks
 */

import { logger } from './logger.js';
import { errorClassifier } from './errorClassification.js';
import { retryCoordinator } from './retryStrategies.js';
import { getBigQueryTools, executeQuery, insertRows } from '../services/mcpClient.js';

/**
 * Recovery strategies
 */
export const RECOVERY_STRATEGIES = {
  AUTOMATIC_RETRY: 'automatic_retry',
  COMPENSATING_TRANSACTION: 'compensating_transaction',
  DATA_REPAIR: 'data_repair',
  ROLLBACK: 'rollback',
  MANUAL_INTERVENTION: 'manual_intervention',
  SKIP_AND_CONTINUE: 'skip_and_continue'
};

/**
 * Recovery states
 */
export const RECOVERY_STATES = {
  PENDING: 'PENDING',
  IN_PROGRESS: 'IN_PROGRESS',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED',
  REQUIRES_MANUAL: 'REQUIRES_MANUAL'
};

/**
 * Consistency check types
 */
export const CONSISTENCY_CHECKS = {
  TRANSACTION_BALANCE: 'transaction_balance',
  WORKFLOW_INTEGRITY: 'workflow_integrity',
  DATA_COMPLETENESS: 'data_completeness',
  REFERENTIAL_INTEGRITY: 'referential_integrity',
  BUSINESS_RULES: 'business_rules'
};

/**
 * Comprehensive recovery manager
 */
export class RecoveryManager {
  constructor(options = {}) {
    this.config = {
      dataset: options.dataset || 'ksingamsetty-test.AI_POC',
      enableAutomaticRecovery: options.enableAutomaticRecovery !== false,
      enableCompensation: options.enableCompensation !== false,
      enableConsistencyChecks: options.enableConsistencyChecks !== false,
      maxRecoveryAttempts: options.maxRecoveryAttempts || 3,
      recoveryTimeout: options.recoveryTimeout || 600000, // 10 minutes
      consistencyCheckInterval: options.consistencyCheckInterval || 300000, // 5 minutes
      enableRecoveryMetrics: options.enableRecoveryMetrics !== false
    };

    // Recovery state tracking
    this.activeRecoveries = new Map();
    this.recoveryHistory = [];
    this.compensationTransactions = new Map();
    this.consistencyChecks = new Map();
    
    // Recovery metrics
    this.recoveryMetrics = {
      totalRecoveries: 0,
      successfulRecoveries: 0,
      failedRecoveries: 0,
      averageRecoveryTime: 0,
      recoveryByStrategy: new Map(),
      recoveryByErrorType: new Map()
    };

    // Start background consistency checker
    if (this.config.enableConsistencyChecks) {
      this.startConsistencyChecker();
    }
  }

  /**
   * Initiate recovery for a failed operation
   */
  async initiateRecovery(error, context = {}) {
    const recoveryId = this.generateRecoveryId();
    const recoveryContext = this.prepareRecoveryContext(error, context, recoveryId);
    
    try {
      logger.info('Initiating recovery procedure', {
        recoveryId,
        errorCode: error.code,
        context: recoveryContext.metadata
      });

      // Classify error and determine recovery strategy
      const classification = errorClassifier.classifyError(error, context);
      const strategy = this.selectRecoveryStrategy(classification, recoveryContext);
      
      // Create recovery record
      await this.createRecoveryRecord(recoveryContext, classification, strategy);
      
      // Execute recovery strategy
      const result = await this.executeRecoveryStrategy(strategy, recoveryContext, classification);
      
      // Finalize recovery
      await this.finalizeRecovery(recoveryContext, result);
      
      return result;

    } catch (recoveryError) {
      await this.handleRecoveryFailure(recoveryContext, recoveryError);
      throw recoveryError;
    } finally {
      this.cleanupRecovery(recoveryId);
    }
  }

  /**
   * Prepare comprehensive recovery context
   */
  prepareRecoveryContext(error, context, recoveryId) {
    return {
      recoveryId,
      startTime: Date.now(),
      error: {
        original: error,
        message: error.message,
        code: error.code,
        step: error.step,
        transactionId: error.transactionId,
        batchId: error.batchId
      },
      metadata: {
        workflowId: context.workflowId,
        batchId: context.batchId,
        step: context.step,
        userId: context.userId,
        processingContext: context
      },
      state: {
        currentAttempt: 0,
        maxAttempts: this.config.maxRecoveryAttempts,
        status: RECOVERY_STATES.PENDING,
        strategy: null
      },
      actions: [],
      compensations: [],
      consistencyIssues: []
    };
  }

  /**
   * Select appropriate recovery strategy based on error classification
   */
  selectRecoveryStrategy(classification, recoveryContext) {
    const primary = classification.analysis.primary;
    const businessImpact = classification.analysis.businessImpact;
    
    // Strategy selection logic based on error characteristics
    if (primary.retryable && primary.maxRetries > 0) {
      return {
        type: RECOVERY_STRATEGIES.AUTOMATIC_RETRY,
        parameters: {
          maxRetries: primary.maxRetries,
          backoffStrategy: primary.backoffStrategy,
          retryCondition: this.createRetryCondition(classification)
        },
        priority: 1
      };
    }

    if (primary.category === 'DATA_VALIDATION' && businessImpact.level !== 'CRITICAL') {
      return {
        type: RECOVERY_STRATEGIES.DATA_REPAIR,
        parameters: {
          repairStrategy: this.selectDataRepairStrategy(classification),
          validationRules: this.getValidationRules(recoveryContext)
        },
        priority: 2
      };
    }

    if (primary.category === 'WORKFLOW_ORCHESTRATION') {
      return {
        type: RECOVERY_STRATEGIES.COMPENSATING_TRANSACTION,
        parameters: {
          compensationType: this.selectCompensationType(classification),
          rollbackScope: this.determineRollbackScope(recoveryContext)
        },
        priority: 3
      };
    }

    if (businessImpact.level === 'CRITICAL') {
      return {
        type: RECOVERY_STRATEGIES.MANUAL_INTERVENTION,
        parameters: {
          escalationLevel: 'IMMEDIATE',
          requiredApprovals: ['OPERATIONS_MANAGER'],
          timeoutMs: 3600000 // 1 hour
        },
        priority: 0
      };
    }

    // Default strategy
    return {
      type: RECOVERY_STRATEGIES.SKIP_AND_CONTINUE,
      parameters: {
        skipReason: 'No suitable automatic recovery strategy found',
        requiresReview: true
      },
      priority: 4
    };
  }

  /**
   * Execute the selected recovery strategy
   */
  async executeRecoveryStrategy(strategy, recoveryContext, classification) {
    recoveryContext.state.strategy = strategy.type;
    recoveryContext.state.status = RECOVERY_STATES.IN_PROGRESS;
    
    logger.info('Executing recovery strategy', {
      recoveryId: recoveryContext.recoveryId,
      strategy: strategy.type,
      parameters: strategy.parameters
    });

    switch (strategy.type) {
      case RECOVERY_STRATEGIES.AUTOMATIC_RETRY:
        return await this.executeAutomaticRetry(strategy, recoveryContext, classification);
      
      case RECOVERY_STRATEGIES.COMPENSATING_TRANSACTION:
        return await this.executeCompensatingTransaction(strategy, recoveryContext);
      
      case RECOVERY_STRATEGIES.DATA_REPAIR:
        return await this.executeDataRepair(strategy, recoveryContext);
      
      case RECOVERY_STRATEGIES.ROLLBACK:
        return await this.executeRollback(strategy, recoveryContext);
      
      case RECOVERY_STRATEGIES.MANUAL_INTERVENTION:
        return await this.executeManualIntervention(strategy, recoveryContext);
      
      case RECOVERY_STRATEGIES.SKIP_AND_CONTINUE:
        return await this.executeSkipAndContinue(strategy, recoveryContext);
      
      default:
        throw new Error(`Unknown recovery strategy: ${strategy.type}`);
    }
  }

  /**
   * Execute automatic retry with sophisticated retry logic
   */
  async executeAutomaticRetry(strategy, recoveryContext, classification) {
    const retryResult = {
      strategy: RECOVERY_STRATEGIES.AUTOMATIC_RETRY,
      success: false,
      attempts: 0,
      totalDuration: 0,
      finalError: null
    };

    try {
      // Prepare the original operation for retry
      const originalOperation = this.reconstructOriginalOperation(recoveryContext);
      
      // Execute with retry coordinator
      const result = await retryCoordinator.executeWithRetry(
        originalOperation,
        {
          operationId: `recovery_${recoveryContext.recoveryId}`,
          operationName: 'recovery_retry',
          maxRetries: strategy.parameters.maxRetries,
          strategy: strategy.parameters.backoffStrategy,
          customRetryCondition: strategy.parameters.retryCondition,
          metadata: recoveryContext.metadata
        }
      );

      retryResult.success = true;
      retryResult.result = result;
      
      return retryResult;

    } catch (error) {
      retryResult.finalError = error;
      return retryResult;
    }
  }

  /**
   * Execute compensating transaction
   */
  async executeCompensatingTransaction(strategy, recoveryContext) {
    const compensationResult = {
      strategy: RECOVERY_STRATEGIES.COMPENSATING_TRANSACTION,
      success: false,
      compensationId: this.generateCompensationId(),
      actions: []
    };

    try {
      const { client } = await getBigQueryTools();
      
      // Determine compensation actions based on the error context
      const compensationActions = await this.planCompensationActions(
        strategy.parameters.compensationType,
        recoveryContext
      );

      for (const action of compensationActions) {
        try {
          await this.executeCompensationAction(client, action, recoveryContext);
          compensationResult.actions.push({
            ...action,
            status: 'COMPLETED',
            completedAt: new Date().toISOString()
          });
        } catch (actionError) {
          compensationResult.actions.push({
            ...action,
            status: 'FAILED',
            error: actionError.message,
            failedAt: new Date().toISOString()
          });
          throw actionError;
        }
      }

      compensationResult.success = true;
      
      // Store compensation transaction record
      await this.recordCompensationTransaction(client, compensationResult, recoveryContext);
      
      return compensationResult;

    } catch (error) {
      compensationResult.error = error.message;
      return compensationResult;
    }
  }

  /**
   * Execute data repair operations
   */
  async executeDataRepair(strategy, recoveryContext) {
    const repairResult = {
      strategy: RECOVERY_STRATEGIES.DATA_REPAIR,
      success: false,
      repairedRecords: 0,
      repairActions: []
    };

    try {
      const { client } = await getBigQueryTools();
      
      // Identify data issues
      const dataIssues = await this.identifyDataIssues(client, recoveryContext);
      
      // Plan repair actions
      const repairActions = this.planDataRepairActions(
        dataIssues,
        strategy.parameters.repairStrategy
      );

      for (const action of repairActions) {
        try {
          const repairResult_action = await this.executeDataRepairAction(
            client, 
            action, 
            recoveryContext
          );
          
          repairResult.repairedRecords += repairResult_action.affectedRecords;
          repairResult.repairActions.push({
            ...action,
            status: 'COMPLETED',
            affectedRecords: repairResult_action.affectedRecords
          });
        } catch (actionError) {
          repairResult.repairActions.push({
            ...action,
            status: 'FAILED',
            error: actionError.message
          });
          throw actionError;
        }
      }

      repairResult.success = true;
      return repairResult;

    } catch (error) {
      repairResult.error = error.message;
      return repairResult;
    }
  }

  /**
   * Execute rollback operations
   */
  async executeRollback(strategy, recoveryContext) {
    const rollbackResult = {
      strategy: RECOVERY_STRATEGIES.ROLLBACK,
      success: false,
      rollbackScope: strategy.parameters.rollbackScope,
      rollbackActions: []
    };

    try {
      const { client } = await getBigQueryTools();
      
      // Determine rollback scope and actions
      const rollbackActions = await this.planRollbackActions(
        strategy.parameters.rollbackScope,
        recoveryContext
      );

      // Execute rollback in reverse order
      for (let i = rollbackActions.length - 1; i >= 0; i--) {
        const action = rollbackActions[i];
        try {
          await this.executeRollbackAction(client, action, recoveryContext);
          rollbackResult.rollbackActions.push({
            ...action,
            status: 'COMPLETED'
          });
        } catch (actionError) {
          rollbackResult.rollbackActions.push({
            ...action,
            status: 'FAILED',
            error: actionError.message
          });
          throw actionError;
        }
      }

      rollbackResult.success = true;
      return rollbackResult;

    } catch (error) {
      rollbackResult.error = error.message;
      return rollbackResult;
    }
  }

  /**
   * Execute manual intervention workflow
   */
  async executeManualIntervention(strategy, recoveryContext) {
    const interventionResult = {
      strategy: RECOVERY_STRATEGIES.MANUAL_INTERVENTION,
      success: false,
      escalationId: this.generateEscalationId(),
      status: 'ESCALATED'
    };

    try {
      // Create escalation ticket
      const escalationTicket = await this.createEscalationTicket(
        strategy.parameters,
        recoveryContext
      );

      interventionResult.escalationTicket = escalationTicket;
      interventionResult.awaitingManualAction = true;
      
      // In a real implementation, this would integrate with ticketing systems
      logger.error('Manual intervention required', {
        recoveryId: recoveryContext.recoveryId,
        escalationId: interventionResult.escalationId,
        escalationLevel: strategy.parameters.escalationLevel,
        timeoutMs: strategy.parameters.timeoutMs
      });

      return interventionResult;

    } catch (error) {
      interventionResult.error = error.message;
      return interventionResult;
    }
  }

  /**
   * Execute skip and continue strategy
   */
  async executeSkipAndContinue(strategy, recoveryContext) {
    const skipResult = {
      strategy: RECOVERY_STRATEGIES.SKIP_AND_CONTINUE,
      success: true,
      skipReason: strategy.parameters.skipReason,
      requiresReview: strategy.parameters.requiresReview
    };

    try {
      const { client } = await getBigQueryTools();
      
      // Mark the failed item for review if required
      if (strategy.parameters.requiresReview) {
        await this.markForManualReview(client, recoveryContext);
      }

      // Log the skip action
      await this.logSkipAction(client, recoveryContext, skipResult);
      
      return skipResult;

    } catch (error) {
      skipResult.error = error.message;
      return skipResult;
    }
  }

  /**
   * Consistency checking methods
   */
  async performConsistencyChecks(workflowId, batchId = null) {
    const checkId = this.generateCheckId();
    const checkResults = {
      checkId,
      workflowId,
      batchId,
      startTime: Date.now(),
      checks: [],
      overallStatus: 'PASSED',
      issuesFound: []
    };

    try {
      const { client } = await getBigQueryTools();
      
      // Execute all consistency check types
      for (const checkType of Object.values(CONSISTENCY_CHECKS)) {
        try {
          const result = await this.executeConsistencyCheck(
            client, 
            checkType, 
            workflowId, 
            batchId
          );
          
          checkResults.checks.push(result);
          
          if (result.status === 'FAILED') {
            checkResults.overallStatus = 'FAILED';
            checkResults.issuesFound.push(...result.issues);
          }
        } catch (error) {
          checkResults.checks.push({
            type: checkType,
            status: 'ERROR',
            error: error.message
          });
          checkResults.overallStatus = 'ERROR';
        }
      }

      // Store consistency check results
      await this.storeConsistencyCheckResults(client, checkResults);
      
      return checkResults;

    } catch (error) {
      checkResults.error = error.message;
      checkResults.overallStatus = 'ERROR';
      return checkResults;
    }
  }

  /**
   * Execute specific consistency check
   */
  async executeConsistencyCheck(client, checkType, workflowId, batchId) {
    const checkResult = {
      type: checkType,
      status: 'PASSED',
      issues: [],
      metrics: {}
    };

    switch (checkType) {
      case CONSISTENCY_CHECKS.TRANSACTION_BALANCE:
        return await this.checkTransactionBalance(client, workflowId, batchId);
      
      case CONSISTENCY_CHECKS.WORKFLOW_INTEGRITY:
        return await this.checkWorkflowIntegrity(client, workflowId);
      
      case CONSISTENCY_CHECKS.DATA_COMPLETENESS:
        return await this.checkDataCompleteness(client, workflowId, batchId);
      
      case CONSISTENCY_CHECKS.REFERENTIAL_INTEGRITY:
        return await this.checkReferentialIntegrity(client, workflowId, batchId);
      
      case CONSISTENCY_CHECKS.BUSINESS_RULES:
        return await this.checkBusinessRules(client, workflowId, batchId);
      
      default:
        throw new Error(`Unknown consistency check type: ${checkType}`);
    }
  }

  /**
   * Check transaction balance consistency
   */
  async checkTransactionBalance(client, workflowId, batchId) {
    const query = `
      SELECT 
        COUNT(*) as total_transactions,
        SUM(CASE WHEN amount > 0 THEN amount ELSE 0 END) as total_debits,
        SUM(CASE WHEN amount < 0 THEN ABS(amount) ELSE 0 END) as total_credits,
        ABS(SUM(amount)) as balance_difference
      FROM ${this.config.dataset}.cash_transactions ct
      JOIN ${this.config.dataset}.ai_cash_clearing_suggestions s 
        ON ct.bt_id = s.bt_id
      WHERE s.processing_batch_id = '${batchId}'
    `;

    const results = await executeQuery(client, query);
    const balanceData = results[0];
    
    const checkResult = {
      type: CONSISTENCY_CHECKS.TRANSACTION_BALANCE,
      status: 'PASSED',
      issues: [],
      metrics: balanceData
    };

    // Check for balance issues
    if (balanceData.balance_difference > 0.01) { // Allow for small rounding errors
      checkResult.status = 'FAILED';
      checkResult.issues.push({
        type: 'BALANCE_MISMATCH',
        severity: 'HIGH',
        description: `Transaction balance difference detected: ${balanceData.balance_difference}`,
        affectedRecords: balanceData.total_transactions
      });
    }

    return checkResult;
  }

  /**
   * Check workflow integrity
   */
  async checkWorkflowIntegrity(client, workflowId) {
    const query = `
      SELECT 
        workflow_status,
        current_step,
        total_transactions,
        processed_transactions,
        failed_transactions,
        CASE 
          WHEN processed_transactions + failed_transactions != total_transactions 
          THEN 'INTEGRITY_ISSUE' 
          ELSE 'OK' 
        END as integrity_status
      FROM ${this.config.dataset}.cash_clearing_workflow_state
      WHERE workflow_id = '${workflowId}'
    `;

    const results = await executeQuery(client, query);
    const workflowData = results[0];
    
    const checkResult = {
      type: CONSISTENCY_CHECKS.WORKFLOW_INTEGRITY,
      status: 'PASSED',
      issues: [],
      metrics: workflowData
    };

    if (workflowData?.integrity_status === 'INTEGRITY_ISSUE') {
      checkResult.status = 'FAILED';
      checkResult.issues.push({
        type: 'WORKFLOW_COUNT_MISMATCH',
        severity: 'HIGH',
        description: 'Workflow transaction counts do not match',
        details: workflowData
      });
    }

    return checkResult;
  }

  /**
   * Data completeness check
   */
  async checkDataCompleteness(client, workflowId, batchId) {
    const query = `
      SELECT 
        COUNT(*) as total_suggestions,
        COUNT(CASE WHEN AI_GL_ACCOUNT IS NULL THEN 1 END) as missing_gl_account,
        COUNT(CASE WHEN AI_CONFIDENCE_SCORE IS NULL THEN 1 END) as missing_confidence,
        COUNT(CASE WHEN AI_REASON IS NULL THEN 1 END) as missing_reason,
        COUNT(CASE WHEN approval_status IS NULL THEN 1 END) as missing_approval_status
      FROM ${this.config.dataset}.ai_cash_clearing_suggestions
      WHERE processing_batch_id = '${batchId}'
    `;

    const results = await executeQuery(client, query);
    const completenessData = results[0];
    
    const checkResult = {
      type: CONSISTENCY_CHECKS.DATA_COMPLETENESS,
      status: 'PASSED',
      issues: [],
      metrics: completenessData
    };

    // Check for missing critical data
    const criticalFields = [
      { field: 'missing_gl_account', name: 'GL Account' },
      { field: 'missing_confidence', name: 'Confidence Score' },
      { field: 'missing_approval_status', name: 'Approval Status' }
    ];

    for (const field of criticalFields) {
      if (completenessData[field.field] > 0) {
        checkResult.status = 'FAILED';
        checkResult.issues.push({
          type: 'MISSING_CRITICAL_DATA',
          severity: 'MEDIUM',
          description: `Missing ${field.name} in ${completenessData[field.field]} records`,
          affectedRecords: completenessData[field.field]
        });
      }
    }

    return checkResult;
  }

  /**
   * Utility methods for recovery operations
   */
  reconstructOriginalOperation(recoveryContext) {
    // Reconstruct the original operation that failed
    // This is a simplified implementation - in practice, this would need
    // to be more sophisticated based on the specific operation type
    
    return async () => {
      // Placeholder for original operation reconstruction
      throw new Error('Original operation reconstruction not implemented');
    };
  }

  async planCompensationActions(compensationType, recoveryContext) {
    const actions = [];
    
    switch (compensationType) {
      case 'SUGGESTION_ROLLBACK':
        actions.push({
          type: 'DELETE_SUGGESTIONS',
          table: `${this.config.dataset}.ai_cash_clearing_suggestions`,
          condition: `processing_batch_id = '${recoveryContext.metadata.batchId}'`
        });
        break;
      
      case 'WORKFLOW_STATE_RESET':
        actions.push({
          type: 'UPDATE_WORKFLOW_STATE',
          table: `${this.config.dataset}.cash_clearing_workflow_state`,
          updates: { workflow_status: 'FAILED', current_step: recoveryContext.error.step - 1 },
          condition: `workflow_id = '${recoveryContext.metadata.workflowId}'`
        });
        break;
    }
    
    return actions;
  }

  async executeCompensationAction(client, action, recoveryContext) {
    let query = '';
    
    switch (action.type) {
      case 'DELETE_SUGGESTIONS':
        query = `DELETE FROM ${action.table} WHERE ${action.condition}`;
        break;
      
      case 'UPDATE_WORKFLOW_STATE':
        const setClause = Object.entries(action.updates)
          .map(([key, value]) => `${key} = '${value}'`)
          .join(', ');
        query = `UPDATE ${action.table} SET ${setClause} WHERE ${action.condition}`;
        break;
    }
    
    if (query) {
      await executeQuery(client, query);
    }
  }

  /**
   * Background consistency checker
   */
  startConsistencyChecker() {
    setInterval(async () => {
      try {
        await this.runScheduledConsistencyChecks();
      } catch (error) {
        logger.error('Scheduled consistency check failed', { error: error.message });
      }
    }, this.config.consistencyCheckInterval);
  }

  async runScheduledConsistencyChecks() {
    const { client } = await getBigQueryTools();
    
    // Get active workflows for consistency checking
    const activeWorkflows = await executeQuery(client, `
      SELECT workflow_id, batch_id 
      FROM ${this.config.dataset}.cash_clearing_workflow_state 
      WHERE workflow_status IN ('RUNNING', 'PAUSED')
    `);

    for (const workflow of activeWorkflows) {
      try {
        const checkResults = await this.performConsistencyChecks(
          workflow.workflow_id,
          workflow.batch_id
        );
        
        if (checkResults.overallStatus === 'FAILED') {
          logger.warn('Consistency check failed for workflow', {
            workflowId: workflow.workflow_id,
            issues: checkResults.issuesFound
          });
        }
      } catch (error) {
        logger.error('Individual consistency check failed', {
          workflowId: workflow.workflow_id,
          error: error.message
        });
      }
    }
  }

  /**
   * Utility methods
   */
  generateRecoveryId() {
    return `recovery_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateCompensationId() {
    return `comp_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateEscalationId() {
    return `esc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateCheckId() {
    return `check_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async createRecoveryRecord(recoveryContext, classification, strategy) {
    // Implementation for creating recovery records in the database
    logger.info('Recovery record created', {
      recoveryId: recoveryContext.recoveryId,
      strategy: strategy.type
    });
  }

  async finalizeRecovery(recoveryContext, result) {
    recoveryContext.state.status = result.success ? 
      RECOVERY_STATES.COMPLETED : RECOVERY_STATES.FAILED;
    
    // Update metrics
    this.updateRecoveryMetrics(recoveryContext, result);
    
    logger.info('Recovery finalized', {
      recoveryId: recoveryContext.recoveryId,
      success: result.success,
      duration: Date.now() - recoveryContext.startTime
    });
  }

  updateRecoveryMetrics(recoveryContext, result) {
    this.recoveryMetrics.totalRecoveries++;
    
    if (result.success) {
      this.recoveryMetrics.successfulRecoveries++;
    } else {
      this.recoveryMetrics.failedRecoveries++;
    }
    
    const duration = Date.now() - recoveryContext.startTime;
    this.recoveryMetrics.averageRecoveryTime = 
      (this.recoveryMetrics.averageRecoveryTime * (this.recoveryMetrics.totalRecoveries - 1) + duration) / 
      this.recoveryMetrics.totalRecoveries;
  }

  cleanupRecovery(recoveryId) {
    this.activeRecoveries.delete(recoveryId);
  }

  async handleRecoveryFailure(recoveryContext, recoveryError) {
    logger.error('Recovery procedure failed', {
      recoveryId: recoveryContext.recoveryId,
      error: recoveryError.message
    });
  }

  getRecoveryMetrics() {
    return { ...this.recoveryMetrics };
  }

  getActiveRecoveries() {
    return Array.from(this.activeRecoveries.values());
  }
}

// Export singleton instance
export const recoveryManager = new RecoveryManager();

/**
 * Convenience function for initiating recovery
 */
export async function initiateRecovery(error, context = {}) {
  return await recoveryManager.initiateRecovery(error, context);
}

/**
 * Convenience function for consistency checks
 */
export async function performConsistencyCheck(workflowId, batchId = null) {
  return await recoveryManager.performConsistencyChecks(workflowId, batchId);
}