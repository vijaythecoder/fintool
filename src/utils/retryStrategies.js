/**
 * Advanced Retry Strategies for Cash Clearing Workflow
 * Implements sophisticated retry patterns with circuit breakers, dead letter queues, and adaptive algorithms
 */

import { logger } from './logger.js';
import { errorClassifier } from './errorClassification.js';

/**
 * Retry strategy implementations
 */
export const RETRY_STRATEGIES = {
  EXPONENTIAL_BACKOFF: 'exponential',
  LINEAR_BACKOFF: 'linear',
  FIXED_DELAY: 'fixed',
  ADAPTIVE: 'adaptive',
  FIBONACCI: 'fibonacci',
  CIRCUIT_BREAKER: 'circuit_breaker'
};

/**
 * Circuit breaker states
 */
export const CIRCUIT_BREAKER_STATES = {
  CLOSED: 'CLOSED',     // Normal operation
  OPEN: 'OPEN',         // Failing fast
  HALF_OPEN: 'HALF_OPEN' // Testing if service recovered
};

/**
 * Advanced retry coordinator with multiple strategies
 */
export class RetryCoordinator {
  constructor(options = {}) {
    this.config = {
      maxRetries: options.maxRetries || 3,
      baseDelay: options.baseDelay || 1000,
      maxDelay: options.maxDelay || 30000,
      jitterPercent: options.jitterPercent || 0.1,
      enableCircuitBreaker: options.enableCircuitBreaker !== false,
      enableDeadLetterQueue: options.enableDeadLetterQueue !== false,
      enableAdaptiveLearning: options.enableAdaptiveLearning !== false
    };

    // Circuit breaker configuration
    this.circuitBreakers = new Map();
    this.circuitBreakerConfig = {
      failureThreshold: options.failureThreshold || 5,
      recoveryTimeout: options.recoveryTimeout || 60000,
      halfOpenMaxCalls: options.halfOpenMaxCalls || 3
    };

    // Dead letter queue for failed operations
    this.deadLetterQueue = [];
    this.maxDeadLetterSize = options.maxDeadLetterSize || 1000;

    // Adaptive learning for retry optimization
    this.retryMetrics = new Map();
    this.learningWindow = options.learningWindow || 100; // Number of operations to learn from

    // Batch retry coordination
    this.batchRetryState = new Map();
  }

  /**
   * Execute operation with comprehensive retry logic
   */
  async executeWithRetry(operation, options = {}) {
    const context = this.prepareRetryContext(operation, options);
    
    try {
      return await this.performRetryLoop(operation, context);
    } catch (finalError) {
      await this.handleFinalFailure(finalError, context);
      throw finalError;
    }
  }

  /**
   * Prepare retry context with all necessary metadata
   */
  prepareRetryContext(operation, options) {
    const operationId = options.operationId || `op_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      operationId,
      operationName: options.operationName || operation.name || 'unknown',
      strategy: options.strategy || RETRY_STRATEGIES.EXPONENTIAL_BACKOFF,
      maxRetries: options.maxRetries || this.config.maxRetries,
      baseDelay: options.baseDelay || this.config.baseDelay,
      maxDelay: options.maxDelay || this.config.maxDelay,
      enableCircuitBreaker: options.enableCircuitBreaker !== false && this.config.enableCircuitBreaker,
      customRetryCondition: options.customRetryCondition,
      metadata: options.metadata || {},
      startTime: Date.now(),
      attempts: 0,
      errors: []
    };
  }

  /**
   * Main retry loop with strategy-specific logic
   */
  async performRetryLoop(operation, context) {
    let lastError = null;

    while (context.attempts <= context.maxRetries) {
      try {
        // Check circuit breaker before attempting operation
        if (context.enableCircuitBreaker) {
          await this.checkCircuitBreaker(context.operationName);
        }

        // Record attempt start
        const attemptStart = Date.now();
        context.attempts++;

        // Execute the operation
        const result = await operation();

        // Record successful execution
        await this.recordSuccess(context, attemptStart);
        
        return result;

      } catch (error) {
        lastError = error;
        context.errors.push({
          attempt: context.attempts,
          error: this.serializeError(error),
          timestamp: new Date().toISOString()
        });

        // Classify error for retry decision
        const classification = errorClassifier.classifyError(error, context.metadata);
        
        // Update circuit breaker
        if (context.enableCircuitBreaker) {
          await this.updateCircuitBreaker(context.operationName, error);
        }

        // Check if we should retry
        if (!this.shouldRetry(error, classification, context)) {
          break;
        }

        // Calculate and apply delay
        const delay = await this.calculateRetryDelay(context, classification);
        
        logger.warn('Operation failed, retrying', {
          operationId: context.operationId,
          operationName: context.operationName,
          attempt: context.attempts,
          maxRetries: context.maxRetries,
          nextRetryIn: delay,
          errorCode: error.code,
          errorMessage: error.message,
          classification: {
            category: classification.analysis.primary.category,
            severity: classification.analysis.primary.severity.level
          }
        });

        await this.delay(delay);
      }
    }

    // All retries exhausted
    throw lastError;
  }

  /**
   * Determine if operation should be retried
   */
  shouldRetry(error, classification, context) {
    // Custom retry condition takes precedence
    if (context.customRetryCondition) {
      return context.customRetryCondition(error, context.attempts, classification);
    }

    // Check if we've exceeded max retries
    if (context.attempts >= context.maxRetries) {
      return false;
    }

    // Use classification to determine retryability
    const primary = classification.analysis.primary;
    if (!primary.retryable) {
      return false;
    }

    // Check classification-specific max retries
    if (context.attempts >= primary.maxRetries) {
      return false;
    }

    return true;
  }

  /**
   * Calculate retry delay based on strategy and adaptive learning
   */
  async calculateRetryDelay(context, classification) {
    const strategy = classification.analysis.primary.backoffStrategy || context.strategy;
    let delay = 0;

    switch (strategy) {
      case RETRY_STRATEGIES.EXPONENTIAL_BACKOFF:
        delay = this.calculateExponentialBackoff(context);
        break;
      
      case RETRY_STRATEGIES.LINEAR_BACKOFF:
        delay = this.calculateLinearBackoff(context);
        break;
      
      case RETRY_STRATEGIES.FIXED_DELAY:
        delay = context.baseDelay;
        break;
      
      case RETRY_STRATEGIES.FIBONACCI:
        delay = this.calculateFibonacciDelay(context);
        break;
      
      case RETRY_STRATEGIES.ADAPTIVE:
        delay = await this.calculateAdaptiveDelay(context, classification);
        break;
      
      default:
        delay = this.calculateExponentialBackoff(context);
    }

    // Apply jitter to prevent thundering herd
    delay = this.applyJitter(delay);
    
    // Ensure delay doesn't exceed maximum
    return Math.min(delay, context.maxDelay);
  }

  /**
   * Exponential backoff calculation
   */
  calculateExponentialBackoff(context) {
    return context.baseDelay * Math.pow(2, context.attempts - 1);
  }

  /**
   * Linear backoff calculation
   */
  calculateLinearBackoff(context) {
    return context.baseDelay * context.attempts;
  }

  /**
   * Fibonacci sequence delay
   */
  calculateFibonacciDelay(context) {
    const fibonacci = (n) => {
      if (n <= 1) return n;
      let a = 0, b = 1;
      for (let i = 2; i <= n; i++) {
        [a, b] = [b, a + b];
      }
      return b;
    };
    
    return context.baseDelay * fibonacci(context.attempts);
  }

  /**
   * Adaptive delay based on historical success rates
   */
  async calculateAdaptiveDelay(context, classification) {
    const operationKey = `${context.operationName}-${classification.analysis.primary.category}`;
    const metrics = this.retryMetrics.get(operationKey);

    if (!metrics || metrics.attempts.length < 10) {
      // Not enough data, fall back to exponential backoff
      return this.calculateExponentialBackoff(context);
    }

    // Calculate optimal delay based on historical success rates
    const successRateByDelay = this.analyzeSuccessRatesByDelay(metrics);
    const optimalDelay = this.findOptimalDelay(successRateByDelay);
    
    // Blend optimal delay with exponential backoff for exploration
    const exponentialDelay = this.calculateExponentialBackoff(context);
    const blendFactor = 0.7; // 70% optimal, 30% exploration
    
    return Math.floor(optimalDelay * blendFactor + exponentialDelay * (1 - blendFactor));
  }

  /**
   * Apply jitter to prevent thundering herd problem
   */
  applyJitter(delay) {
    const jitterAmount = delay * this.config.jitterPercent;
    const jitter = (Math.random() - 0.5) * 2 * jitterAmount;
    return Math.max(0, Math.floor(delay + jitter));
  }

  /**
   * Circuit breaker management
   */
  async checkCircuitBreaker(operationName) {
    const circuitBreaker = this.getCircuitBreaker(operationName);
    
    switch (circuitBreaker.state) {
      case CIRCUIT_BREAKER_STATES.OPEN:
        if (Date.now() - circuitBreaker.lastFailureTime >= this.circuitBreakerConfig.recoveryTimeout) {
          circuitBreaker.state = CIRCUIT_BREAKER_STATES.HALF_OPEN;
          circuitBreaker.halfOpenAttempts = 0;
          logger.info('Circuit breaker transitioning to HALF_OPEN', { operationName });
        } else {
          throw new Error(`Circuit breaker is OPEN for ${operationName}. Recovery timeout not reached.`);
        }
        break;
      
      case CIRCUIT_BREAKER_STATES.HALF_OPEN:
        if (circuitBreaker.halfOpenAttempts >= this.circuitBreakerConfig.halfOpenMaxCalls) {
          throw new Error(`Circuit breaker HALF_OPEN limit reached for ${operationName}`);
        }
        circuitBreaker.halfOpenAttempts++;
        break;
      
      case CIRCUIT_BREAKER_STATES.CLOSED:
        // Normal operation
        break;
    }
  }

  /**
   * Update circuit breaker state based on operation result
   */
  async updateCircuitBreaker(operationName, error = null) {
    const circuitBreaker = this.getCircuitBreaker(operationName);
    
    if (error) {
      circuitBreaker.failures++;
      circuitBreaker.lastFailureTime = Date.now();
      
      if (circuitBreaker.state === CIRCUIT_BREAKER_STATES.HALF_OPEN) {
        // Failed during half-open, go back to open
        circuitBreaker.state = CIRCUIT_BREAKER_STATES.OPEN;
        logger.warn('Circuit breaker returning to OPEN state', { operationName });
      } else if (circuitBreaker.failures >= this.circuitBreakerConfig.failureThreshold) {
        // Threshold exceeded, open the circuit
        circuitBreaker.state = CIRCUIT_BREAKER_STATES.OPEN;
        logger.warn('Circuit breaker OPENED', { 
          operationName, 
          failures: circuitBreaker.failures,
          threshold: this.circuitBreakerConfig.failureThreshold
        });
      }
    } else {
      // Success
      if (circuitBreaker.state === CIRCUIT_BREAKER_STATES.HALF_OPEN) {
        // Success during half-open, close the circuit
        circuitBreaker.state = CIRCUIT_BREAKER_STATES.CLOSED;
        circuitBreaker.failures = 0;
        logger.info('Circuit breaker CLOSED after successful recovery', { operationName });
      } else {
        // Regular success, reset failure count
        circuitBreaker.failures = Math.max(0, circuitBreaker.failures - 1);
      }
    }
  }

  /**
   * Get or create circuit breaker for operation
   */
  getCircuitBreaker(operationName) {
    if (!this.circuitBreakers.has(operationName)) {
      this.circuitBreakers.set(operationName, {
        state: CIRCUIT_BREAKER_STATES.CLOSED,
        failures: 0,
        lastFailureTime: null,
        halfOpenAttempts: 0
      });
    }
    return this.circuitBreakers.get(operationName);
  }

  /**
   * Record successful operation for adaptive learning
   */
  async recordSuccess(context, attemptStart) {
    const duration = Date.now() - attemptStart;
    const operationKey = `${context.operationName}`;
    
    if (!this.retryMetrics.has(operationKey)) {
      this.retryMetrics.set(operationKey, {
        attempts: [],
        successes: [],
        failures: []
      });
    }
    
    const metrics = this.retryMetrics.get(operationKey);
    metrics.successes.push({
      attempt: context.attempts,
      duration,
      timestamp: Date.now()
    });
    
    // Maintain sliding window
    this.maintainMetricsWindow(metrics);
    
    // Update circuit breaker on success
    if (context.enableCircuitBreaker) {
      await this.updateCircuitBreaker(context.operationName);
    }
  }

  /**
   * Handle final failure after all retries exhausted
   */
  async handleFinalFailure(error, context) {
    logger.error('Operation failed after all retries', {
      operationId: context.operationId,
      operationName: context.operationName,
      totalAttempts: context.attempts,
      totalDuration: Date.now() - context.startTime,
      errors: context.errors
    });

    // Add to dead letter queue if enabled
    if (this.config.enableDeadLetterQueue) {
      await this.addToDeadLetterQueue(error, context);
    }

    // Record failure metrics
    await this.recordFailure(context, error);
  }

  /**
   * Add failed operation to dead letter queue
   */
  async addToDeadLetterQueue(error, context) {
    const deadLetterEntry = {
      operationId: context.operationId,
      operationName: context.operationName,
      error: this.serializeError(error),
      context: {
        attempts: context.attempts,
        totalDuration: Date.now() - context.startTime,
        metadata: context.metadata
      },
      timestamp: new Date().toISOString(),
      retryable: true // Can be retried manually or by background process
    };

    this.deadLetterQueue.push(deadLetterEntry);
    
    // Maintain queue size limit
    if (this.deadLetterQueue.length > this.maxDeadLetterSize) {
      this.deadLetterQueue = this.deadLetterQueue.slice(-this.maxDeadLetterSize);
    }

    logger.info('Operation added to dead letter queue', {
      operationId: context.operationId,
      queueSize: this.deadLetterQueue.length
    });
  }

  /**
   * Batch retry coordination for related operations
   */
  async executeBatchWithRetry(operations, options = {}) {
    const batchId = options.batchId || `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const batchOptions = {
      maxConcurrency: options.maxConcurrency || 3,
      failFast: options.failFast || false,
      partialSuccess: options.partialSuccess !== false,
      coordinatedRetry: options.coordinatedRetry !== false
    };

    logger.info('Starting batch retry execution', {
      batchId,
      operationCount: operations.length,
      options: batchOptions
    });

    const results = [];
    const errors = [];
    
    // Initialize batch state
    this.batchRetryState.set(batchId, {
      totalOperations: operations.length,
      completed: 0,
      failed: 0,
      startTime: Date.now()
    });

    try {
      if (batchOptions.coordinatedRetry) {
        return await this.executeCoordinatedBatchRetry(operations, batchId, batchOptions);
      } else {
        return await this.executeIndependentBatchRetry(operations, batchId, batchOptions);
      }
    } finally {
      this.batchRetryState.delete(batchId);
    }
  }

  /**
   * Execute batch with coordinated retry strategy
   */
  async executeCoordinatedBatchRetry(operations, batchId, options) {
    const results = [];
    const semaphore = new Semaphore(options.maxConcurrency);
    
    const executeWithSemaphore = async (operation, index) => {
      await semaphore.acquire();
      try {
        const result = await this.executeWithRetry(operation, {
          operationId: `${batchId}_op_${index}`,
          operationName: `batch_operation_${index}`,
          metadata: { batchId, operationIndex: index }
        });
        return { success: true, result, index };
      } catch (error) {
        return { success: false, error, index };
      } finally {
        semaphore.release();
      }
    };

    const promises = operations.map(executeWithSemaphore);
    const results_raw = await Promise.allSettled(promises);
    
    const successful = [];
    const failed = [];
    
    results_raw.forEach((result, index) => {
      if (result.status === 'fulfilled' && result.value.success) {
        successful.push(result.value);
      } else {
        failed.push({
          index,
          error: result.status === 'rejected' ? result.reason : result.value.error
        });
      }
    });

    logger.info('Batch retry execution completed', {
      batchId,
      successful: successful.length,
      failed: failed.length,
      totalDuration: Date.now() - this.batchRetryState.get(batchId).startTime
    });

    return {
      batchId,
      successful,
      failed,
      hasFailures: failed.length > 0,
      successRate: successful.length / operations.length
    };
  }

  /**
   * Execute batch with independent retry strategies
   */
  async executeIndependentBatchRetry(operations, batchId, options) {
    // Similar to coordinated but each operation uses its own retry strategy
    // Implementation would be similar but without coordination between operations
    return await this.executeCoordinatedBatchRetry(operations, batchId, options);
  }

  /**
   * Utility methods
   */
  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  serializeError(error) {
    return {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack,
      timestamp: new Date().toISOString()
    };
  }

  maintainMetricsWindow(metrics) {
    const maxSize = this.learningWindow;
    if (metrics.successes.length > maxSize) {
      metrics.successes = metrics.successes.slice(-maxSize);
    }
    if (metrics.failures.length > maxSize) {
      metrics.failures = metrics.failures.slice(-maxSize);
    }
  }

  /**
   * Analytics and monitoring
   */
  getRetryMetrics() {
    const circuitBreakerStats = {};
    for (const [name, breaker] of this.circuitBreakers.entries()) {
      circuitBreakerStats[name] = {
        state: breaker.state,
        failures: breaker.failures,
        lastFailureTime: breaker.lastFailureTime
      };
    }

    return {
      circuitBreakers: circuitBreakerStats,
      deadLetterQueueSize: this.deadLetterQueue.length,
      retryMetricsSize: this.retryMetrics.size,
      batchOperations: this.batchRetryState.size
    };
  }

  getDeadLetterQueue() {
    return [...this.deadLetterQueue];
  }

  clearDeadLetterQueue() {
    const size = this.deadLetterQueue.length;
    this.deadLetterQueue = [];
    logger.info('Dead letter queue cleared', { previousSize: size });
  }

  async recordFailure(context, error) {
    const operationKey = `${context.operationName}`;
    
    if (!this.retryMetrics.has(operationKey)) {
      this.retryMetrics.set(operationKey, {
        attempts: [],
        successes: [],
        failures: []
      });
    }
    
    const metrics = this.retryMetrics.get(operationKey);
    metrics.failures.push({
      attempts: context.attempts,
      duration: Date.now() - context.startTime,
      error: this.serializeError(error),
      timestamp: Date.now()
    });
    
    this.maintainMetricsWindow(metrics);
  }
}

/**
 * Simple semaphore implementation for concurrency control
 */
class Semaphore {
  constructor(permits) {
    this.permits = permits;
    this.waiting = [];
  }

  async acquire() {
    if (this.permits > 0) {
      this.permits--;
      return;
    }

    return new Promise(resolve => {
      this.waiting.push(resolve);
    });
  }

  release() {
    if (this.waiting.length > 0) {
      const resolve = this.waiting.shift();
      resolve();
    } else {
      this.permits++;
    }
  }
}

// Export singleton instance
export const retryCoordinator = new RetryCoordinator();

/**
 * Convenience function for simple retry operations
 */
export async function withRetry(operation, options = {}) {
  return await retryCoordinator.executeWithRetry(operation, options);
}

/**
 * Convenience function for batch operations
 */
export async function withBatchRetry(operations, options = {}) {
  return await retryCoordinator.executeBatchWithRetry(operations, options);
}