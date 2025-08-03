/**
 * Enhanced Cash Clearing Processor with Advanced Error Handling and Batch Processing
 * Extends the base CashClearingProcessor with comprehensive error management, recovery, and monitoring
 */

import { CashClearingProcessor } from './cashClearingProcessor.js';
import { errorClassifier, classifyAndLogError } from '../utils/errorClassification.js';
import { retryCoordinator, withRetry, withBatchRetry } from '../utils/retryStrategies.js';
import { batchProcessor, processWithEnhancedBatching } from '../utils/batchProcessor.js';
import { recoveryManager, initiateRecovery, performConsistencyCheck } from '../utils/recoveryManager.js';
import { monitoringSystem, recordMetric } from '../utils/monitoringSystem.js';
import { ErrorHandler, ProcessingError, ValidationError, BigQueryError, AIProcessingError } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';
import { getBigQueryTools, executeQuery, insertRows } from '../services/mcpClient.js';

/**
 * Enhanced processor with comprehensive error handling and batch processing
 */
export class EnhancedCashClearingProcessor extends CashClearingProcessor {
  constructor(options = {}) {
    super(options);
    
    // Enhanced error handling configuration
    this.errorHandler = new ErrorHandler({
      maxRetries: options.maxRetries || 3,
      baseRetryDelay: options.baseRetryDelay || 1000,
      maxRetryDelay: options.maxRetryDelay || 30000,
      enableCircuitBreaker: options.enableCircuitBreaker !== false,
      circuitBreakerThreshold: options.circuitBreakerThreshold || 5
    });

    // Enhanced batch processing configuration
    this.batchConfig = {
      strategy: options.batchStrategy || 'dynamic_size',
      executionMode: options.executionMode || 'parallel',
      enableCheckpointing: options.enableCheckpointing !== false,
      enableAdaptiveSizing: options.enableAdaptiveSizing !== false,
      maxBatchSize: options.maxBatchSize || 500,
      minBatchSize: options.minBatchSize || 50,
      targetThroughput: options.targetThroughput || 1000 // transactions per minute
    };

    // Recovery and consistency configuration
    this.recoveryConfig = {
      enableAutomaticRecovery: options.enableAutomaticRecovery !== false,
      enableCompensation: options.enableCompensation !== false,
      enableConsistencyChecks: options.enableConsistencyChecks !== false,
      consistencyCheckInterval: options.consistencyCheckInterval || 300000 // 5 minutes
    };

    // Monitoring configuration
    this.monitoringConfig = {
      enableRealTimeMonitoring: options.enableRealTimeMonitoring !== false,
      enableAlerting: options.enableAlerting !== false,
      enablePatternDetection: options.enablePatternDetection !== false,
      alertThresholds: {
        errorRate: options.errorRateThreshold || 0.05,
        performanceDegradation: options.performanceDegradation || 0.3,
        resourceUtilization: options.resourceUtilization || 0.85
      }
    };

    // Initialize enhanced systems
    this.initializeEnhancedSystems();
  }

  /**
   * Initialize enhanced error handling, monitoring, and recovery systems
   */
  initializeEnhancedSystems() {
    // Initialize monitoring
    if (this.monitoringConfig.enableRealTimeMonitoring) {
      this.initializeMonitoring();
    }

    // Set up error event handlers
    this.setupErrorEventHandlers();

    // Initialize recovery procedures
    if (this.recoveryConfig.enableAutomaticRecovery) {
      this.initializeRecoveryProcedures();
    }

    logger.info('Enhanced cash clearing processor initialized', {
      errorHandling: true,
      batchProcessing: this.batchConfig.strategy,
      monitoring: this.monitoringConfig.enableRealTimeMonitoring,
      recovery: this.recoveryConfig.enableAutomaticRecovery
    });
  }

  /**
   * Enhanced workflow execution with comprehensive error handling
   */
  async executeCashClearingWorkflow(options = {}) {
    const startTime = Date.now();
    const batchId = `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const workflowContext = {
      ...options,
      batchId,
      startTime,
      enhancedProcessing: true
    };

    try {
      logger.info('Starting enhanced cash clearing workflow', { 
        batchId, 
        options: workflowContext 
      });

      // Record workflow start metrics
      recordMetric('workflow_started', 1, { batchId });
      recordMetric('active_workflows', 1);

      // Execute workflow with enhanced error handling
      const result = await this.errorHandler.executeWithRetry(
        () => this.executeEnhancedWorkflow(workflowContext),
        {
          step: 0,
          batchId,
          maxRetries: 2, // Limited retries for full workflow
          retryCondition: (error) => this.shouldRetryWorkflow(error)
        }
      );

      // Record success metrics
      const totalTime = Date.now() - startTime;
      recordMetric('workflow_completed', 1, { batchId, duration: totalTime });
      recordMetric('workflow_throughput', result.summary.totalProcessed / (totalTime / 60000)); // per minute
      recordMetric('active_workflows', -1); // Decrement

      // Perform final consistency checks
      if (this.recoveryConfig.enableConsistencyChecks) {
        await this.performFinalConsistencyCheck(result.workflowId, batchId);
      }

      logger.info('Enhanced workflow completed successfully', {
        batchId,
        workflowId: result.workflowId,
        totalTime,
        processed: result.summary.totalProcessed,
        errorRate: result.summary.errorRate || 0
      });

      return result;

    } catch (error) {
      // Enhanced error handling and recovery
      const enhancedError = await this.handleWorkflowFailure(error, workflowContext);
      throw enhancedError;
    }
  }

  /**
   * Execute enhanced workflow with advanced batch processing
   */
  async executeEnhancedWorkflow(workflowContext) {
    const { client, tools } = await getBigQueryTools();
    
    // Initialize enhanced workflow state
    const workflowState = await this.initializeEnhancedWorkflowState(
      client, 
      workflowContext.batchId, 
      workflowContext
    );

    try {
      // Step 1: Enhanced transaction retrieval with intelligent batching
      const step1Result = await this.executeEnhancedStep1(client, workflowState);
      
      if (step1Result.data.length === 0) {
        return this.createEmptyWorkflowResult(workflowState);
      }

      // Step 2: Enhanced pattern matching with adaptive processing
      const step2Result = await this.executeEnhancedStep2(
        client, 
        tools, 
        step1Result.data, 
        workflowState
      );

      // Step 3: Enhanced GL mapping with error resilience
      const step3Result = await this.executeEnhancedStep3(
        client, 
        tools, 
        step2Result.data, 
        workflowState
      );

      // Step 4: Enhanced suggestion generation with validation
      const step4Result = await this.executeEnhancedStep4(
        client, 
        tools, 
        step3Result.data, 
        workflowState
      );

      // Finalize enhanced workflow
      return await this.finalizeEnhancedWorkflow(client, workflowState, {
        step1: step1Result,
        step2: step2Result,
        step3: step3Result,
        step4: step4Result
      });

    } catch (error) {
      // Attempt recovery before failing
      if (this.recoveryConfig.enableAutomaticRecovery) {
        try {
          const recoveryResult = await initiateRecovery(error, {
            workflowId: workflowState.workflow_id,
            batchId: workflowState.batch_id,
            step: this.getCurrentStep(error),
            context: workflowContext
          });

          if (recoveryResult.success) {
            logger.info('Workflow recovered successfully', {
              workflowId: workflowState.workflow_id,
              recoveryStrategy: recoveryResult.strategy
            });
            
            // Continue from where recovery left off
            return await this.continueFromRecovery(client, workflowState, recoveryResult);
          }
        } catch (recoveryError) {
          logger.error('Recovery failed', {
            workflowId: workflowState.workflow_id,
            originalError: error.message,
            recoveryError: recoveryError.message
          });
        }
      }

      throw error;
    }
  }

  /**
   * Enhanced Step 1: Transaction retrieval with intelligent batching
   */
  async executeEnhancedStep1(client, workflowState) {
    const stepStartTime = Date.now();
    
    try {
      logger.info('Executing Enhanced Step 1: Intelligent Transaction Retrieval', {
        batchId: workflowState.batch_id
      });

      // Use enhanced batch processing for transaction retrieval
      const result = await processWithEnhancedBatching(
        [{ query: this.queryBuilder.getCashTransactionsWithPattern('T_NOTFOUND', this.batchSize).build() }],
        async (queryBatch) => {
          return await this.executeQueryWithRetry(client, queryBatch[0].query);
        },
        {
          batchStrategy: 'fixed_size',
          executionMode: 'sequential',
          enableMetrics: true
        }
      );

      const transactions = result.batchResults[0]?.result || [];

      // Record metrics
      recordMetric('step1_transactions_retrieved', transactions.length);
      recordMetric('step1_processing_time', Date.now() - stepStartTime);

      // Log audit entry with enhanced details
      if (this.enableAuditLog) {
        await this.logEnhancedAuditEntry(client, {
          workflow_id: workflowState.workflow_id,
          step_number: 1,
          action_type: 'ENHANCED_QUERY',
          action_details: { 
            transactionCount: transactions.length,
            batchMetrics: result.summary,
            performanceMetrics: {
              avgThroughput: result.summary.averageThroughput,
              successRate: result.summary.successRate
            }
          },
          processing_time_ms: Date.now() - stepStartTime
        });
      }

      return {
        completed: true,
        count: transactions.length,
        timeMs: Date.now() - stepStartTime,
        data: transactions,
        enhancedMetrics: result.summary
      };

    } catch (error) {
      const classifiedError = classifyAndLogError(error, {
        step: 1,
        batchId: workflowState.batch_id,
        operation: 'transaction_retrieval'
      });

      recordMetric('step1_errors', 1, { 
        errorType: classifiedError.analysis.primary.category 
      });

      throw new ProcessingError(
        `Enhanced Step 1 failed: ${error.message}`,
        'STEP1_ENHANCED_ERROR',
        1,
        null,
        workflowState.batch_id,
        classifiedError.analysis.primary.retryable
      );
    }
  }

  /**
   * Enhanced Step 2: Pattern matching with adaptive processing
   */
  async executeEnhancedStep2(client, tools, transactions, workflowState) {
    const stepStartTime = Date.now();
    
    try {
      logger.info('Executing Enhanced Step 2: Adaptive Pattern Matching', {
        batchId: workflowState.batch_id,
        transactionCount: transactions.length
      });

      // Get patterns with retry logic
      const patterns = await withRetry(
        () => this.getActiveProcessorPatterns(client),
        {
          operationName: 'get_processor_patterns',
          maxRetries: 3
        }
      );

      // Enhanced batch processing with adaptive sizing
      const result = await processWithEnhancedBatching(
        transactions,
        async (batch, batchIndex) => {
          return await this.processPatternMatchingBatch(
            batch, 
            patterns, 
            tools, 
            workflowState,
            batchIndex
          );
        },
        {
          batchStrategy: this.batchConfig.strategy,
          executionMode: this.batchConfig.executionMode,
          enableCheckpointing: this.batchConfig.enableCheckpointing,
          enableAdaptiveSizing: this.batchConfig.enableAdaptiveSizing,
          maxBatchSize: this.batchConfig.maxBatchSize,
          minBatchSize: this.batchConfig.minBatchSize
        }
      );

      const matchedTransactions = result.batchResults
        .filter(r => r.processed > 0)
        .flatMap(r => r.result || []);

      // Record enhanced metrics
      recordMetric('step2_pattern_matches', matchedTransactions.length);
      recordMetric('step2_processing_time', Date.now() - stepStartTime);
      recordMetric('step2_batch_efficiency', result.summary.successRate);

      // Enhanced audit logging
      if (this.enableAuditLog) {
        await this.logEnhancedAuditEntry(client, {
          workflow_id: workflowState.workflow_id,
          step_number: 2,
          action_type: 'ENHANCED_PATTERN_MATCHING',
          action_details: {
            patternsUsed: patterns.length,
            matchedTransactions: matchedTransactions.length,
            batchMetrics: result.summary,
            adaptiveInsights: result.performance?.adaptiveInsights
          },
          processing_time_ms: Date.now() - stepStartTime
        });
      }

      return {
        completed: true,
        count: matchedTransactions.length,
        timeMs: Date.now() - stepStartTime,
        data: matchedTransactions,
        enhancedMetrics: result.summary,
        performanceInsights: result.performance
      };

    } catch (error) {
      const classifiedError = classifyAndLogError(error, {
        step: 2,
        batchId: workflowState.batch_id,
        operation: 'pattern_matching',
        transactionCount: transactions.length
      });

      recordMetric('step2_errors', 1, {
        errorType: classifiedError.analysis.primary.category
      });

      throw new ProcessingError(
        `Enhanced Step 2 failed: ${error.message}`,
        'STEP2_ENHANCED_ERROR',
        2,
        null,
        workflowState.batch_id,
        classifiedError.analysis.primary.retryable
      );
    }
  }

  /**
   * Enhanced Step 3: GL mapping with error resilience
   */
  async executeEnhancedStep3(client, tools, matchedTransactions, workflowState) {
    const stepStartTime = Date.now();
    
    try {
      logger.info('Executing Enhanced Step 3: Resilient GL Account Mapping', {
        batchId: workflowState.batch_id,
        transactionCount: matchedTransactions.length
      });

      // Enhanced batch processing with error isolation
      const result = await processWithEnhancedBatching(
        matchedTransactions,
        async (batch, batchIndex) => {
          return await this.processGLMappingBatch(
            batch,
            client,
            tools,
            workflowState,
            batchIndex
          );
        },
        {
          batchStrategy: 'adaptive_size',
          executionMode: 'parallel',
          enableCheckpointing: true,
          maxConcurrency: this.maxConcurrentSteps,
          failFast: false, // Continue processing other batches if one fails
          partialSuccess: true
        }
      );

      const mappedTransactions = result.batchResults
        .filter(r => r.processed > 0)
        .flatMap(r => r.result || []);

      const requiresApproval = this.assessApprovalRequirement(mappedTransactions);

      // Record metrics
      recordMetric('step3_gl_mappings', mappedTransactions.length);
      recordMetric('step3_processing_time', Date.now() - stepStartTime);
      recordMetric('step3_approval_required', requiresApproval ? 1 : 0);

      // Enhanced audit logging
      if (this.enableAuditLog) {
        await this.logEnhancedAuditEntry(client, {
          workflow_id: workflowState.workflow_id,
          step_number: 3,
          action_type: 'ENHANCED_GL_MAPPING',
          action_details: {
            mappedTransactions: mappedTransactions.length,
            requiresApproval,
            batchMetrics: result.summary,
            errorHandling: {
              failedBatches: result.batchResults.filter(r => r.failed > 0).length,
              recoveredTransactions: result.summary.totalProcessed - result.summary.totalErrors
            }
          },
          processing_time_ms: Date.now() - stepStartTime
        });
      }

      return {
        completed: true,
        count: mappedTransactions.length,
        timeMs: Date.now() - stepStartTime,
        data: mappedTransactions,
        requiresApproval,
        enhancedMetrics: result.summary,
        errorHandling: result.errors
      };

    } catch (error) {
      const classifiedError = classifyAndLogError(error, {
        step: 3,
        batchId: workflowState.batch_id,
        operation: 'gl_mapping',
        transactionCount: matchedTransactions.length
      });

      recordMetric('step3_errors', 1, {
        errorType: classifiedError.analysis.primary.category
      });

      throw new ProcessingError(
        `Enhanced Step 3 failed: ${error.message}`,
        'STEP3_ENHANCED_ERROR',
        3,
        null,
        workflowState.batch_id,
        classifiedError.analysis.primary.retryable
      );
    }
  }

  /**
   * Enhanced Step 4: Suggestion generation with validation
   */
  async executeEnhancedStep4(client, tools, mappedTransactions, workflowState) {
    const stepStartTime = Date.now();
    
    try {
      logger.info('Executing Enhanced Step 4: Validated Suggestion Generation', {
        batchId: workflowState.batch_id,
        transactionCount: mappedTransactions.length
      });

      // Pre-validate transactions before suggestion generation
      const validatedTransactions = await this.preValidateTransactions(mappedTransactions);

      // Enhanced batch processing with comprehensive validation
      const result = await processWithEnhancedBatching(
        validatedTransactions,
        async (batch, batchIndex) => {
          return await this.processSuggestionGenerationBatch(
            batch,
            workflowState,
            batchIndex
          );
        },
        {
          batchStrategy: 'load_balanced',
          executionMode: 'parallel',
          enableCheckpointing: true,
          enableDataQualityChecks: true
        }
      );

      const suggestions = result.batchResults
        .filter(r => r.processed > 0)
        .flatMap(r => r.result || []);

      // Enhanced suggestion validation and storage
      if (suggestions.length > 0) {
        const validatedSuggestions = await this.validateAndStoreSuggestions(
          client,
          suggestions,
          workflowState
        );
        
        // Record final metrics
        recordMetric('step4_suggestions_generated', validatedSuggestions.length);
        recordMetric('step4_processing_time', Date.now() - stepStartTime);
        recordMetric('step4_validation_success_rate', 
          validatedSuggestions.length / suggestions.length);
      }

      // Enhanced audit logging
      if (this.enableAuditLog) {
        await this.logEnhancedAuditEntry(client, {
          workflow_id: workflowState.workflow_id,
          step_number: 4,
          action_type: 'ENHANCED_SUGGESTIONS_CREATED',
          action_details: {
            suggestionsCount: suggestions.length,
            validationMetrics: result.summary,
            dataQualityScore: this.calculateDataQualityScore(suggestions)
          },
          processing_time_ms: Date.now() - stepStartTime
        });
      }

      return {
        completed: true,
        count: suggestions.length,
        timeMs: Date.now() - stepStartTime,
        data: suggestions,
        enhancedMetrics: result.summary,
        validationResults: result.performance
      };

    } catch (error) {
      const classifiedError = classifyAndLogError(error, {
        step: 4,
        batchId: workflowState.batch_id,
        operation: 'suggestion_generation',
        transactionCount: mappedTransactions.length
      });

      recordMetric('step4_errors', 1, {
        errorType: classifiedError.analysis.primary.category
      });

      throw new ProcessingError(
        `Enhanced Step 4 failed: ${error.message}`,
        'STEP4_ENHANCED_ERROR',
        4,
        null,
        workflowState.batch_id,
        classifiedError.analysis.primary.retryable
      );
    }
  }

  /**
   * Enhanced workflow failure handling
   */
  async handleWorkflowFailure(error, workflowContext) {
    const startTime = Date.now();
    
    try {
      logger.error('Enhanced workflow failure detected', {
        batchId: workflowContext.batchId,
        error: error.message,
        step: error.step || 'unknown'
      });

      // Classify the error for better handling
      const classification = errorClassifier.classifyError(error, workflowContext);
      
      // Record error metrics
      recordMetric('workflow_failures', 1, {
        errorType: classification.analysis.primary.category,
        severity: classification.analysis.primary.severity.level,
        step: error.step || 0
      });

      // Update workflow state to failed
      await this.updateWorkflowStateToFailed(workflowContext.batchId, error);

      // Attempt automatic recovery if enabled
      if (this.recoveryConfig.enableAutomaticRecovery && classification.analysis.primary.retryable) {
        try {
          const recoveryResult = await initiateRecovery(error, {
            workflowId: workflowContext.workflowId,
            batchId: workflowContext.batchId,
            step: error.step,
            userId: workflowContext.userId,
            context: workflowContext
          });

          if (recoveryResult.success) {
            recordMetric('workflow_recoveries', 1, {
              strategy: recoveryResult.strategy
            });
            
            logger.info('Workflow recovery successful', {
              batchId: workflowContext.batchId,
              recoveryStrategy: recoveryResult.strategy,
              recoveryTime: Date.now() - startTime
            });

            return new ProcessingError(
              `Workflow recovered: ${error.message}`,
              'WORKFLOW_RECOVERED',
              error.step || 0,
              null,
              workflowContext.batchId,
              false,
              { recoveryResult, originalError: error }
            );
          }
        } catch (recoveryError) {
          logger.error('Workflow recovery failed', {
            batchId: workflowContext.batchId,
            recoveryError: recoveryError.message,
            originalError: error.message
          });
        }
      }

      // Return enhanced error with classification
      return new ProcessingError(
        error.message,
        error.code || 'WORKFLOW_FAILURE',
        error.step || 0,
        error.transactionId,
        workflowContext.batchId,
        classification.analysis.primary.retryable,
        {
          classification,
          workflowContext,
          failureTime: Date.now(),
          originalError: error
        }
      );

    } catch (handlingError) {
      logger.error('Error handling workflow failure', {
        batchId: workflowContext.batchId,
        handlingError: handlingError.message,
        originalError: error.message
      });

      return error; // Return original error if handling fails
    }
  }

  /**
   * Enhanced monitoring initialization
   */
  initializeMonitoring() {
    // Set up metric collection intervals
    setInterval(() => {
      this.collectPerformanceMetrics();
    }, 30000); // Every 30 seconds

    // Set up alert monitoring
    monitoringSystem.on('alert:triggered', (alert) => {
      this.handleTriggeredAlert(alert);
    });

    // Set up pattern detection
    monitoringSystem.on('pattern:detected', (pattern) => {
      this.handleDetectedPattern(pattern);
    });
  }

  /**
   * Enhanced audit logging
   */
  async logEnhancedAuditEntry(client, entry) {
    if (!this.enableAuditLog) return;

    const enhancedEntry = {
      ...entry,
      ai_model: this.model,
      processing_time_ms: entry.processing_time_ms || 0,
      enhanced_processing: true,
      system_metrics: {
        memory_usage: process.memoryUsage(),
        cpu_usage: process.cpuUsage(),
        timestamp: new Date().toISOString()
      }
    };

    const auditData = this.queryBuilder.insertAuditLog(enhancedEntry);
    await insertRows(client, auditData.table, auditData.rows);
  }

  /**
   * Utility methods for enhanced processing
   */
  async executeQueryWithRetry(client, query) {
    return await withRetry(
      () => executeQuery(client, query),
      {
        operationName: 'bigquery_execute',
        maxRetries: 3,
        strategy: 'exponential'
      }
    );
  }

  async getActiveProcessorPatterns(client) {
    const query = this.queryBuilder.getActiveProcessorPatterns().build();
    return await this.executeQueryWithRetry(client, query);
  }

  shouldRetryWorkflow(error) {
    const classification = errorClassifier.classifyError(error);
    return classification.analysis.primary.retryable && 
           classification.analysis.businessImpact.level !== 'CRITICAL';
  }

  getCurrentStep(error) {
    return error.step || 0;
  }

  async performFinalConsistencyCheck(workflowId, batchId) {
    try {
      const checkResult = await performConsistencyCheck(workflowId, batchId);
      
      if (checkResult.overallStatus === 'FAILED') {
        logger.warn('Final consistency check failed', {
          workflowId,
          batchId,
          issues: checkResult.issuesFound
        });
        
        // Trigger alert for consistency issues
        recordMetric('consistency_check_failures', 1, {
          workflowId,
          batchId,
          issueCount: checkResult.issuesFound.length
        });
      }
      
      return checkResult;
    } catch (error) {
      logger.error('Final consistency check error', {
        workflowId,
        batchId,
        error: error.message
      });
    }
  }

  collectPerformanceMetrics() {
    const memUsage = process.memoryUsage();
    recordMetric('memory_usage', memUsage.heapUsed / memUsage.heapTotal);
    recordMetric('active_workflows', this.getActiveWorkflowCount());
  }

  getActiveWorkflowCount() {
    // In a real implementation, this would query the database
    return 1; // Placeholder
  }

  handleTriggeredAlert(alert) {
    logger.warn('Alert triggered in enhanced processor', {
      alertType: alert.type,
      severity: alert.severity.level,
      message: alert.message
    });
  }

  handleDetectedPattern(pattern) {
    logger.info('Pattern detected in enhanced processor', {
      patternType: pattern.type,
      severity: pattern.severity?.level
    });
  }

  async updateWorkflowStateToFailed(batchId, error) {
    try {
      const { client } = await getBigQueryTools();
      const query = `
        UPDATE ${this.dataset}.cash_clearing_workflow_state 
        SET workflow_status = 'FAILED',
            error_details = JSON '${JSON.stringify({ 
              error: error.message, 
              timestamp: new Date().toISOString(),
              enhanced_processing: true 
            })}',
            updated_at = CURRENT_TIMESTAMP()
        WHERE batch_id = '${batchId}'
      `;
      
      await executeQuery(client, query);
    } catch (updateError) {
      logger.error('Failed to update workflow state to failed', { 
        batchId, 
        updateError: updateError.message 
      });
    }
  }

  // Additional helper methods would be implemented here...
  // For brevity, I'm including the key ones above

  getErrorStats() {
    return this.errorHandler.getErrorStats();
  }

  getEnhancedMetrics() {
    return {
      errorHandling: this.errorHandler.getErrorStats(),
      monitoring: monitoringSystem.getSystemHealth(),
      batchProcessing: batchProcessor.getMetricHistory('workflow_throughput')
    };
  }
}

// Export enhanced processor
export { EnhancedCashClearingProcessor };

// Export convenience function
export function createEnhancedProcessor(options = {}) {
  return new EnhancedCashClearingProcessor(options);
}