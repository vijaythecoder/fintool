/**
 * Cash Clearing Workflow Usage Examples
 * 
 * This file demonstrates how to use the CashClearingProcessor
 * for the 4-step cash clearing workflow with BigQuery integration.
 */

import { CashClearingProcessor } from '../processors/cashClearingProcessor.js';
import { getConfig, createCustomConfig } from '../config/cashClearingConfig.js';
import { ErrorHandler } from '../utils/errorHandler.js';
import { logger } from '../utils/logger.js';

/**
 * Example 1: Basic Cash Clearing Workflow
 */
export async function basicCashClearingExample() {
  logger.info('Running basic cash clearing workflow example');
  
  try {
    // Initialize processor with default configuration
    const processor = new CashClearingProcessor({
      model: 'gpt-4-turbo',
      dataset: 'financial_data',
      batchSize: 50,
      confidenceThreshold: 0.85,
      requireHumanApproval: false // For demo purposes
    });

    // Execute the 4-step workflow
    const result = await processor.executeCashClearingWorkflow({
      pattern: 'T_NOTFOUND',
      processAll: false,
      dryRun: false
    });

    logger.info('Basic workflow completed', {
      workflowId: result.workflowId,
      batchId: result.batchId,
      totalProcessed: result.results.summary.totalProcessed,
      processingTime: result.processingTimeMs
    });

    return result;

  } catch (error) {
    logger.error('Basic workflow failed', { error: error.message });
    throw error;
  }
}

/**
 * Example 2: Custom Configuration Workflow
 */
export async function customConfigWorkflowExample() {
  logger.info('Running custom configuration workflow example');

  try {
    // Create custom configuration
    const customConfig = createCustomConfig({
      batchProcessing: {
        batchSize: 25,
        concurrency: 2,
        retryAttempts: 5
      },
      approvalSettings: {
        requireHumanApproval: true,
        autoApproveThreshold: 0.95
      },
      aiConfiguration: {
        model: 'gpt-4-turbo',
        temperature: 0.05, // More deterministic
        maxTokens: 6000
      }
    });

    // Initialize processor with custom config
    const processor = new CashClearingProcessor({
      ...customConfig.batchProcessing,
      confidenceThreshold: customConfig.approvalSettings.autoApproveThreshold,
      requireHumanApproval: customConfig.approvalSettings.requireHumanApproval,
      model: customConfig.aiConfiguration.model
    });

    // Execute workflow with specific options
    const result = await processor.executeCashClearingWorkflow({
      pattern: 'T_NOTFOUND',
      maxTransactions: 100,
      prioritizeHighValue: true,
      includeLowConfidence: true
    });

    logger.info('Custom workflow completed', result);
    return result;

  } catch (error) {
    logger.error('Custom workflow failed', { error: error.message });
    throw error;
  }
}

/**
 * Example 3: Workflow with Error Handling and Retry Logic
 */
export async function robustWorkflowExample() {
  logger.info('Running robust workflow with error handling');

  const errorHandler = new ErrorHandler({
    maxRetries: 5,
    baseRetryDelay: 2000,
    enableCircuitBreaker: true,
    circuitBreakerThreshold: 3
  });

  try {
    const processor = new CashClearingProcessor({
      batchSize: 100,
      concurrency: 3,
      retryAttempts: 3,
      enableAuditLog: true
    });

    // Execute with error handling
    const result = await errorHandler.executeWithRetry(
      () => processor.executeCashClearingWorkflow({
        pattern: 'T_NOTFOUND',
        validateInputs: true,
        enableRecovery: true
      }),
      {
        step: 0,
        batchId: 'robust_example',
        maxRetries: 3,
        retryCondition: (error) => {
          // Custom retry logic
          return error.retryable && !error.message.includes('validation');
        }
      }
    );

    logger.info('Robust workflow completed successfully', {
      errorStats: errorHandler.getErrorStats(),
      result: result.results.summary
    });

    return result;

  } catch (error) {
    logger.error('Robust workflow failed after all retries', { 
      error: error.message,
      errorStats: errorHandler.getErrorStats()
    });
    throw error;
  }
}

/**
 * Example 4: Batch Processing with Progress Monitoring
 */
export async function batchProcessingExample() {
  logger.info('Running batch processing example with monitoring');

  try {
    const processor = new CashClearingProcessor({
      batchSize: 20,
      concurrency: 2,
      maxSteps: 15
    });

    let totalProcessed = 0;
    let totalErrors = 0;

    // Configure progress monitoring
    const progressHandler = {
      onProgress: (processed, total) => {
        totalProcessed = processed;
        const percentage = ((processed / total) * 100).toFixed(1);
        logger.info(`Processing progress: ${processed}/${total} (${percentage}%)`);
      },
      onError: (error, batch, batchIndex) => {
        totalErrors++;
        logger.warn(`Batch ${batchIndex} failed`, { 
          error: error.message,
          batchSize: batch.length 
        });
      },
      onBatchComplete: (results, batchIndex) => {
        logger.debug(`Batch ${batchIndex} completed`, {
          resultsCount: results.length,
          successRate: results.filter(r => r.status === 'success').length / results.length
        });
      }
    };

    // Execute workflow with monitoring
    const result = await processor.executeCashClearingWorkflow({
      pattern: 'T_NOTFOUND',
      batchSize: 20,
      progressHandler
    });

    logger.info('Batch processing completed', {
      totalProcessed,
      totalErrors,
      finalResult: result.results.summary
    });

    return result;

  } catch (error) {
    logger.error('Batch processing failed', { error: error.message });
    throw error;
  }
}

/**
 * Example 5: Human Approval Workflow
 */
export async function humanApprovalExample() {
  logger.info('Running human approval workflow example');

  try {
    const processor = new CashClearingProcessor({
      requireHumanApproval: true,
      approvalThreshold: 0.9,
      enableAuditLog: true
    });

    // Step 1: Execute workflow (will pause at approval checkpoint)
    const workflowResult = await processor.executeCashClearingWorkflow({
      pattern: 'T_NOTFOUND',
      requireApproval: true
    });

    logger.info('Workflow paused for approvals', {
      workflowId: workflowResult.workflowId,
      batchId: workflowResult.batchId
    });

    // Step 2: Get pending approvals
    const pendingApprovals = await processor.getPendingApprovals(workflowResult.batchId);
    
    logger.info(`Found ${pendingApprovals.length} pending approvals`);

    // Step 3: Simulate approval process
    for (const approval of pendingApprovals.slice(0, 3)) { // Approve first 3
      if (approval.confidence_score > 0.8) {
        await processor.approveTransaction(
          approval.suggestion_id,
          'finance_manager',
          'Auto-approved based on high confidence'
        );
        logger.info(`Approved suggestion ${approval.suggestion_id}`);
      } else {
        await processor.rejectTransaction(
          approval.suggestion_id,
          'finance_manager',
          'Confidence too low for auto-approval'
        );
        logger.info(`Rejected suggestion ${approval.suggestion_id}`);
      }
    }

    // Step 4: Check workflow status
    const finalStatus = await processor.getWorkflowStatus(workflowResult.batchId);
    logger.info('Final workflow status', finalStatus);

    return { workflowResult, pendingApprovals, finalStatus };

  } catch (error) {
    logger.error('Human approval workflow failed', { error: error.message });
    throw error;
  }
}

/**
 * Example 6: Performance Testing and Monitoring
 */
export async function performanceTestingExample() {
  logger.info('Running performance testing example');

  const startTime = Date.now();
  const metrics = {
    totalTransactions: 0,
    averageProcessingTime: 0,
    successRate: 0,
    errorRate: 0,
    stepTimes: {},
    memoryUsage: process.memoryUsage()
  };

  try {
    const processor = new CashClearingProcessor({
      batchSize: 100,
      concurrency: 4,
      enableAuditLog: true
    });

    // Execute multiple workflow runs for performance testing
    const runs = 3;
    const results = [];

    for (let i = 0; i < runs; i++) {
      logger.info(`Performance test run ${i + 1}/${runs}`);
      
      const runStartTime = Date.now();
      
      const result = await processor.executeCashClearingWorkflow({
        pattern: 'T_NOTFOUND',
        maxTransactions: 50,
        enableMetrics: true
      });

      const runTime = Date.now() - runStartTime;
      
      results.push({
        run: i + 1,
        processingTime: runTime,
        totalProcessed: result.results.summary.totalProcessed,
        stepResults: result.results.stepResults
      });

      metrics.totalTransactions += result.results.summary.totalProcessed;
      
      logger.info(`Run ${i + 1} completed in ${runTime}ms`);
    }

    // Calculate final metrics
    const totalTime = Date.now() - startTime;
    metrics.averageProcessingTime = totalTime / runs;
    metrics.successRate = results.filter(r => r.totalProcessed > 0).length / runs;
    metrics.transactionsPerSecond = metrics.totalTransactions / (totalTime / 1000);
    metrics.finalMemoryUsage = process.memoryUsage();

    logger.info('Performance testing completed', {
      runs,
      totalTime,
      metrics,
      results: results.map(r => ({
        run: r.run,
        processingTime: r.processingTime,
        totalProcessed: r.totalProcessed
      }))
    });

    return { metrics, results };

  } catch (error) {
    logger.error('Performance testing failed', { error: error.message });
    throw error;
  }
}

/**
 * Example 7: Recovery and Restart Workflow
 */
export async function recoveryWorkflowExample() {
  logger.info('Running recovery workflow example');

  try {
    const processor = new CashClearingProcessor({
      enableAuditLog: true,
      retryAttempts: 3
    });

    // Simulate a workflow that needs recovery
    let workflowId = null;
    let batchId = null;

    try {
      // Start initial workflow
      const result = await processor.executeCashClearingWorkflow({
        pattern: 'T_NOTFOUND',
        maxTransactions: 100
      });
      
      workflowId = result.workflowId;
      batchId = result.batchId;
      
    } catch (error) {
      logger.warn('Initial workflow failed, attempting recovery', { error: error.message });
      
      // In a real scenario, you would extract workflowId/batchId from error context
      // For demo, we'll create a new workflow
      
      const recoveryResult = await processor.executeCashClearingWorkflow({
        pattern: 'T_NOTFOUND',
        maxTransactions: 50, // Reduced batch size for recovery
        isRecovery: true,
        previousBatchId: batchId
      });

      logger.info('Recovery workflow completed', {
        originalBatchId: batchId,
        recoveryWorkflowId: recoveryResult.workflowId,
        recoveryResult: recoveryResult.results.summary
      });

      return recoveryResult;
    }

    logger.info('No recovery needed - workflow completed successfully', {
      workflowId,
      batchId
    });

    return { workflowId, batchId, recoveryNeeded: false };

  } catch (error) {
    logger.error('Recovery workflow failed', { error: error.message });
    throw error;
  }
}

/**
 * Main example runner
 */
export async function runAllExamples() {
  logger.info('Running all cash clearing workflow examples');

  const examples = [
    { name: 'Basic Workflow', fn: basicCashClearingExample },
    { name: 'Custom Configuration', fn: customConfigWorkflowExample },
    { name: 'Robust Error Handling', fn: robustWorkflowExample },
    { name: 'Batch Processing', fn: batchProcessingExample },
    { name: 'Human Approval', fn: humanApprovalExample },
    { name: 'Performance Testing', fn: performanceTestingExample },
    { name: 'Recovery Workflow', fn: recoveryWorkflowExample }
  ];

  const results = {};

  for (const example of examples) {
    try {
      logger.info(`Running example: ${example.name}`);
      const startTime = Date.now();
      
      const result = await example.fn();
      const executionTime = Date.now() - startTime;
      
      results[example.name] = {
        success: true,
        executionTime,
        result
      };
      
      logger.info(`Example '${example.name}' completed in ${executionTime}ms`);
      
    } catch (error) {
      results[example.name] = {
        success: false,
        error: error.message
      };
      
      logger.error(`Example '${example.name}' failed:`, error.message);
    }
  }

  logger.info('All examples completed', {
    totalExamples: examples.length,
    successful: Object.values(results).filter(r => r.success).length,
    failed: Object.values(results).filter(r => !r.success).length
  });

  return results;
}

// Export individual examples for direct usage
export {
  basicCashClearingExample,
  customConfigWorkflowExample,
  robustWorkflowExample,
  batchProcessingExample,
  humanApprovalExample,
  performanceTestingExample,
  recoveryWorkflowExample
};

// If running directly, execute all examples
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllExamples()
    .then(results => {
      console.log('Examples execution completed:', results);
      process.exit(0);
    })
    .catch(error => {
      console.error('Examples execution failed:', error);
      process.exit(1);
    });
}