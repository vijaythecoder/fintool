import { logger } from './logger.js';

/**
 * Custom error classes for cash clearing workflow
 */
export class ProcessingError extends Error {
  constructor(message, code, step, transactionId = null, batchId = null, retryable = true, context = {}) {
    super(message);
    this.name = 'ProcessingError';
    this.code = code;
    this.step = step;
    this.transactionId = transactionId;
    this.batchId = batchId;
    this.retryable = retryable;
    this.context = context;
    this.timestamp = new Date().toISOString();
  }
}

export class ValidationError extends ProcessingError {
  constructor(message, validationFailures, transactionId = null) {
    super(message, 'VALIDATION_ERROR', 0, transactionId, null, false);
    this.name = 'ValidationError';
    this.validationFailures = validationFailures;
  }
}

export class BigQueryError extends ProcessingError {
  constructor(message, originalError, step, retryable = true) {
    super(message, 'BIGQUERY_ERROR', step, null, null, retryable);
    this.name = 'BigQueryError';
    this.originalError = originalError;
  }
}

export class AIProcessingError extends ProcessingError {
  constructor(message, aiModel, step, transactionId = null, retryable = true) {
    super(message, 'AI_PROCESSING_ERROR', step, transactionId, null, retryable);
    this.name = 'AIProcessingError';
    this.aiModel = aiModel;
  }
}

export class ApprovalTimeoutError extends ProcessingError {
  constructor(message, timeoutMs, suggestionId) {
    super(message, 'APPROVAL_TIMEOUT', 3, null, null, false);
    this.name = 'ApprovalTimeoutError';
    this.timeoutMs = timeoutMs;
    this.suggestionId = suggestionId;
  }
}

/**
 * Error Handler Class
 */
export class ErrorHandler {
  constructor(options = {}) {
    this.maxRetries = options.maxRetries || 3;
    this.baseRetryDelay = options.baseRetryDelay || 1000;
    this.maxRetryDelay = options.maxRetryDelay || 30000;
    this.enableCircuitBreaker = options.enableCircuitBreaker !== false;
    this.circuitBreakerThreshold = options.circuitBreakerThreshold || 5;
    this.circuitBreakerWindow = options.circuitBreakerWindow || 60000; // 1 minute
    
    // Circuit breaker state
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: null,
      state: 'CLOSED' // CLOSED, OPEN, HALF_OPEN
    };
    
    // Error tracking
    this.errorStats = {
      total: 0,
      byCode: {},
      byStep: {},
      retryable: 0,
      nonRetryable: 0
    };
  }

  /**
   * Execute function with retry logic and error handling
   */
  async executeWithRetry(fn, context = {}) {
    const { 
      step = 0, 
      transactionId = null, 
      batchId = null,
      maxRetries = this.maxRetries,
      retryCondition = null 
    } = context;

    let lastError = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        // Check circuit breaker
        if (this.enableCircuitBreaker && this.circuitBreaker.state === 'OPEN') {
          if (this.shouldTryCircuitBreaker()) {
            this.circuitBreaker.state = 'HALF_OPEN';
            logger.info('Circuit breaker moving to HALF_OPEN state');
          } else {
            throw new ProcessingError(
              'Circuit breaker is OPEN - operation not allowed',
              'CIRCUIT_BREAKER_OPEN',
              step,
              transactionId,
              batchId,
              false
            );
          }
        }

        const result = await fn();
        
        // Success - reset circuit breaker
        if (this.circuitBreaker.state === 'HALF_OPEN') {
          this.circuitBreaker.state = 'CLOSED';
          this.circuitBreaker.failures = 0;
          logger.info('Circuit breaker reset to CLOSED state');
        }

        return result;

      } catch (error) {
        lastError = this.wrapError(error, step, transactionId, batchId);
        attempt++;

        // Update error statistics
        this.updateErrorStats(lastError);

        // Update circuit breaker
        if (this.enableCircuitBreaker) {
          this.updateCircuitBreaker(lastError);
        }

        // Log error with context
        this.logError(lastError, attempt, maxRetries);

        // Check if we should retry
        if (attempt > maxRetries || !this.shouldRetry(lastError, retryCondition)) {
          break;
        }

        // Calculate retry delay with exponential backoff
        const retryDelay = this.calculateRetryDelay(attempt);
        logger.info(`Retrying in ${retryDelay}ms (attempt ${attempt}/${maxRetries})`, {
          step,
          transactionId,
          batchId,
          errorCode: lastError.code
        });

        await this.delay(retryDelay);
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Wrap any error into a ProcessingError
   */
  wrapError(error, step, transactionId, batchId) {
    if (error instanceof ProcessingError) {
      return error;
    }

    // Identify error type and create appropriate wrapper
    if (error.message.includes('BigQuery') || error.message.includes('query')) {
      return new BigQueryError(
        `BigQuery operation failed: ${error.message}`,
        error,
        step,
        this.isBigQueryRetryable(error)
      );
    }

    if (error.message.includes('AI') || error.message.includes('OpenAI')) {
      return new AIProcessingError(
        `AI processing failed: ${error.message}`,
        'unknown',
        step,
        transactionId,
        this.isAIRetryable(error)
      );
    }

    // Generic processing error
    return new ProcessingError(
      error.message,
      'UNKNOWN_ERROR',
      step,
      transactionId,
      batchId,
      true,
      { originalError: error.name }
    );
  }

  /**
   * Determine if error should be retried
   */
  shouldRetry(error, customCondition = null) {
    // Custom retry condition takes precedence
    if (customCondition) {
      return customCondition(error);
    }

    // Non-retryable errors
    if (!error.retryable) {
      return false;
    }

    // Specific error code checks
    const nonRetryableCodes = [
      'VALIDATION_ERROR',
      'APPROVAL_TIMEOUT',
      'CIRCUIT_BREAKER_OPEN',
      'AUTHORIZATION_ERROR',
      'PERMISSION_DENIED'
    ];

    if (nonRetryableCodes.includes(error.code)) {
      return false;
    }

    return true;
  }

  /**
   * Calculate retry delay with exponential backoff and jitter
   */
  calculateRetryDelay(attempt) {
    const exponentialDelay = this.baseRetryDelay * Math.pow(2, attempt - 1);
    const jitter = Math.random() * 0.1 * exponentialDelay; // 10% jitter
    const totalDelay = Math.min(exponentialDelay + jitter, this.maxRetryDelay);
    return Math.floor(totalDelay);
  }

  /**
   * Circuit breaker logic
   */
  updateCircuitBreaker(error) {
    this.circuitBreaker.failures++;
    this.circuitBreaker.lastFailureTime = Date.now();

    if (this.circuitBreaker.failures >= this.circuitBreakerThreshold) {
      this.circuitBreaker.state = 'OPEN';
      logger.warn('Circuit breaker opened due to consecutive failures', {
        failures: this.circuitBreaker.failures,
        threshold: this.circuitBreakerThreshold
      });
    }
  }

  shouldTryCircuitBreaker() {
    const timeSinceLastFailure = Date.now() - this.circuitBreaker.lastFailureTime;
    return timeSinceLastFailure >= this.circuitBreakerWindow;
  }

  /**
   * Error classification helpers
   */
  isBigQueryRetryable(error) {
    const retryableMessages = [
      'timeout',
      'rate limit',
      'quota exceeded',
      'temporary',
      'service unavailable',
      'connection',
      'network'
    ];

    return retryableMessages.some(msg => 
      error.message.toLowerCase().includes(msg)
    );
  }

  isAIRetryable(error) {
    const retryableMessages = [
      'rate limit',
      'timeout',
      'service unavailable',
      'temporary',
      'overloaded'
    ];

    return retryableMessages.some(msg => 
      error.message.toLowerCase().includes(msg)
    );
  }

  /**
   * Error statistics and monitoring
   */
  updateErrorStats(error) {
    this.errorStats.total++;
    
    // By error code
    if (!this.errorStats.byCode[error.code]) {
      this.errorStats.byCode[error.code] = 0;
    }
    this.errorStats.byCode[error.code]++;

    // By step
    if (!this.errorStats.byStep[error.step]) {
      this.errorStats.byStep[error.step] = 0;
    }
    this.errorStats.byStep[error.step]++;

    // By retryability
    if (error.retryable) {
      this.errorStats.retryable++;
    } else {
      this.errorStats.nonRetryable++;
    }
  }

  /**
   * Enhanced error logging
   */
  logError(error, attempt, maxRetries) {
    const logLevel = error.retryable && attempt <= maxRetries ? 'warn' : 'error';
    
    logger[logLevel]('Processing error occurred', {
      errorType: error.name,
      errorCode: error.code,
      step: error.step,
      transactionId: error.transactionId,
      batchId: error.batchId,
      retryable: error.retryable,
      attempt,
      maxRetries,
      message: error.message,
      context: error.context,
      timestamp: error.timestamp
    });
  }

  /**
   * Validation helpers
   */
  validateTransaction(transaction) {
    const errors = [];
    const warnings = [];

    // Required fields
    if (!transaction.transaction_id) {
      errors.push('Transaction ID is required');
    }

    if (!transaction.amount || transaction.amount <= 0) {
      errors.push('Valid positive amount is required');
    }

    if (!transaction.transaction_date) {
      errors.push('Transaction date is required');
    }

    // Data quality checks
    if (transaction.reference_number && transaction.reference_number.length < 3) {
      warnings.push('Reference number seems too short');
    }

    if (transaction.description && transaction.description.length < 10) {
      warnings.push('Description seems too brief for accurate processing');
    }

    // Amount validation
    if (transaction.amount > 1000000) { // $1M threshold
      warnings.push('Large amount transaction - may require special handling');
    }

    const isValid = errors.length === 0;
    const confidence = isValid ? (warnings.length === 0 ? 1.0 : 0.8) : 0.0;

    return {
      isValid,
      errors,
      warnings,
      confidence,
      validationChecks: {
        hasTransactionId: !!transaction.transaction_id,
        hasValidAmount: transaction.amount > 0,
        hasDate: !!transaction.transaction_date,
        hasReference: !!transaction.reference_number,
        hasDescription: !!transaction.description
      }
    };
  }

  validateWorkflowState(workflowState) {
    const errors = [];

    if (!workflowState.batch_id) {
      errors.push('Batch ID is required');
    }

    if (!workflowState.workflow_id) {
      errors.push('Workflow ID is required');
    }

    if (workflowState.current_step < 1 || workflowState.current_step > 4) {
      errors.push('Current step must be between 1 and 4');
    }

    if (workflowState.total_transactions < 0) {
      errors.push('Total transactions cannot be negative');
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  /**
   * Error recovery helpers
   */
  async recoverFromError(error, context = {}) {
    logger.info('Attempting error recovery', {
      errorCode: error.code,
      step: error.step,
      context
    });

    switch (error.code) {
      case 'BIGQUERY_ERROR':
        return await this.recoverFromBigQueryError(error, context);
      
      case 'AI_PROCESSING_ERROR':
        return await this.recoverFromAIError(error, context);
      
      case 'VALIDATION_ERROR':
        return await this.recoverFromValidationError(error, context);
      
      default:
        logger.warn('No specific recovery strategy for error code', { errorCode: error.code });
        return false;
    }
  }

  async recoverFromBigQueryError(error, context) {
    // Implement BigQuery-specific recovery strategies
    if (error.message.includes('quota')) {
      logger.info('Implementing quota recovery strategy');
      await this.delay(60000); // Wait 1 minute for quota reset
      return true;
    }

    if (error.message.includes('timeout')) {
      logger.info('Implementing timeout recovery strategy');
      // Reduce batch size or query complexity
      return true;
    }

    return false;
  }

  async recoverFromAIError(error, context) {
    // Implement AI-specific recovery strategies
    if (error.message.includes('rate limit')) {
      logger.info('Implementing AI rate limit recovery');
      await this.delay(30000); // Wait 30 seconds
      return true;
    }

    return false;
  }

  async recoverFromValidationError(error, context) {
    // Log validation error for analysis
    logger.warn('Validation error encountered - manual intervention may be required', {
      validationFailures: error.validationFailures,
      transactionId: error.transactionId
    });
    
    return false; // Validation errors typically require manual intervention
  }

  /**
   * Utility methods
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  getErrorStats() {
    return {
      ...this.errorStats,
      circuitBreakerState: this.circuitBreaker.state,
      circuitBreakerFailures: this.circuitBreaker.failures
    };
  }

  resetErrorStats() {
    this.errorStats = {
      total: 0,
      byCode: {},
      byStep: {},
      retryable: 0,
      nonRetryable: 0
    };
    
    this.circuitBreaker = {
      failures: 0,
      lastFailureTime: null,
      state: 'CLOSED'
    };
  }

  /**
   * Error escalation
   */
  shouldEscalateError(error) {
    // Escalate if too many failures of the same type
    const errorTypeCount = this.errorStats.byCode[error.code] || 0;
    const escalationThreshold = 10;

    if (errorTypeCount >= escalationThreshold) {
      return true;
    }

    // Escalate critical errors immediately
    const criticalCodes = [
      'AUTHORIZATION_ERROR',
      'PERMISSION_DENIED',
      'DATA_CORRUPTION'
    ];

    return criticalCodes.includes(error.code);
  }

  async escalateError(error, context = {}) {
    logger.error('Escalating error for manual intervention', {
      error: {
        code: error.code,
        message: error.message,
        step: error.step,
        transactionId: error.transactionId,
        batchId: error.batchId
      },
      context,
      errorStats: this.getErrorStats()
    });

    // In a real implementation, this would trigger alerts/notifications
    // For now, we'll just log the escalation
  }
}

// Export singleton instance for easy usage
export const errorHandler = new ErrorHandler();