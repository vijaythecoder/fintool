/**
 * Advanced Parallel Execution Engine
 * Implements work-stealing, pipelining, and intelligent task distribution
 */

import { logger } from '../utils/logger.js';

export class ParallelExecutionEngine {
  constructor(options = {}) {
    this.config = {
      maxConcurrency: options.maxConcurrency || 10,
      enableWorkStealing: options.enableWorkStealing !== false,
      enablePipelining: options.enablePipelining !== false,
      queueSize: options.queueSize || 10000,
      workerTimeout: options.workerTimeout || 300000, // 5 minutes
      adaptiveScheduling: options.adaptiveScheduling !== false
    };

    // Worker pool management
    this.workers = [];
    this.taskQueue = [];
    this.activePromises = new Map();
    this.completedTasks = 0;
    this.failedTasks = 0;

    // Performance tracking
    this.metrics = {
      totalTasks: 0,
      completedTasks: 0,
      failedTasks: 0,
      averageExecutionTime: 0,
      throughput: 0,
      workerUtilization: 0,
      workStealingCount: 0
    };

    // Work-stealing queues for each worker
    this.workerQueues = [];
    this.workerStats = [];
  }

  /**
   * Initialize worker pool
   */
  async initializeWorkerPool() {
    const initStartTime = performance.now();
    
    try {
      // Initialize worker queues and stats
      for (let i = 0; i < this.config.maxConcurrency; i++) {
        this.workerQueues.push([]);
        this.workerStats.push({
          id: i,
          tasksCompleted: 0,
          tasksFailed: 0,
          totalExecutionTime: 0,
          isActive: false,
          workStolen: 0,
          workGiven: 0
        });
      }

      const initTime = performance.now() - initStartTime;
      
      logger.info('Parallel execution engine initialized', {
        maxConcurrency: this.config.maxConcurrency,
        enableWorkStealing: this.config.enableWorkStealing,
        enablePipelining: this.config.enablePipelining,
        initTime: initTime.toFixed(2) + 'ms'
      });

    } catch (error) {
      logger.error('Worker pool initialization failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute tasks in parallel with advanced scheduling
   */
  async executeParallel(items, batchSize, processor, options = {}) {
    const executionStartTime = performance.now();
    const executionId = this.generateExecutionId();
    
    try {
      logger.info('Starting parallel execution', {
        executionId,
        itemCount: items.length,
        batchSize,
        maxConcurrency: this.config.maxConcurrency,
        workStealing: this.config.enableWorkStealing,
        pipelining: this.config.enablePipelining
      });

      // Create batches with intelligent distribution
      const batches = this.createIntelligentBatches(items, batchSize);
      this.metrics.totalTasks += batches.length;

      // Choose execution strategy
      let results;
      if (this.config.enablePipelining && batches.length > this.config.maxConcurrency * 2) {
        results = await this.executePipelined(batches, processor, options);
      } else if (this.config.enableWorkStealing) {
        results = await this.executeWithWorkStealing(batches, processor, options);
      } else {
        results = await this.executeTraditionalParallel(batches, processor, options);
      }

      const executionTime = performance.now() - executionStartTime;
      this.updateMetrics(batches.length, executionTime);

      logger.info('Parallel execution completed', {
        executionId,
        batchesProcessed: batches.length,
        totalTime: executionTime.toFixed(2) + 'ms',
        throughput: (batches.length / (executionTime / 1000)).toFixed(2) + ' batches/sec',
        workerUtilization: this.calculateWorkerUtilization()
      });

      return results;

    } catch (error) {
      logger.error('Parallel execution failed', { 
        executionId, 
        error: error.message 
      });
      throw error;
    }
  }

  /**
   * Create intelligent batches with load balancing
   */
  createIntelligentBatches(items, batchSize) {
    const batches = [];
    
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      
      batches.push({
        id: batches.length,
        items: batch,
        estimatedComplexity: this.estimateBatchComplexity(batch),
        priority: this.calculateBatchPriority(batch),
        size: batch.length
      });
    }

    // Sort by priority and complexity for optimal scheduling
    if (this.config.adaptiveScheduling) {
      batches.sort((a, b) => {
        if (a.priority !== b.priority) {
          return b.priority - a.priority; // Higher priority first
        }
        return a.estimatedComplexity - b.estimatedComplexity; // Lower complexity first
      });
    }

    return batches;
  }

  /**
   * Execute with work-stealing algorithm
   */
  async executeWithWorkStealing(batches, processor, options = {}) {
    const results = new Array(batches.length);
    
    // Distribute initial work to worker queues
    this.distributeInitialWork(batches);
    
    // Start workers
    const workerPromises = [];
    for (let workerId = 0; workerId < this.config.maxConcurrency; workerId++) {
      workerPromises.push(this.startWorker(workerId, processor, results, options));
    }

    // Wait for all workers to complete
    await Promise.all(workerPromises);

    // Flatten results maintaining order
    return this.reconstructOrderedResults(results, batches.length);
  }

  /**
   * Distribute initial work among workers
   */
  distributeInitialWork(batches) {
    // Round-robin distribution with load balancing
    for (let i = 0; i < batches.length; i++) {
      const workerId = i % this.config.maxConcurrency;
      this.workerQueues[workerId].push(batches[i]);
    }

    logger.debug('Initial work distributed', {
      batchCount: batches.length,
      workers: this.config.maxConcurrency,
      queueSizes: this.workerQueues.map(q => q.length)
    });
  }

  /**
   * Start individual worker with work-stealing capability
   */
  async startWorker(workerId, processor, results, options) {
    const workerStartTime = performance.now();
    this.workerStats[workerId].isActive = true;

    try {
      while (true) {
        // Get next task from own queue
        let batch = this.workerQueues[workerId].shift();
        
        // If no work in own queue, try to steal work
        if (!batch && this.config.enableWorkStealing) {
          batch = this.stealWork(workerId);
        }

        // If still no work, break
        if (!batch) {
          break;
        }

        // Execute batch
        const batchStartTime = performance.now();
        
        try {
          const result = await this.executeWithTimeout(
            () => processor(batch.items, batch.id),
            this.config.workerTimeout
          );

          results[batch.id] = result;
          
          const batchTime = performance.now() - batchStartTime;
          this.workerStats[workerId].tasksCompleted++;
          this.workerStats[workerId].totalExecutionTime += batchTime;
          this.completedTasks++;

          // Report progress if callback provided
          if (options.progressCallback) {
            options.progressCallback(this.completedTasks, this.metrics.totalTasks);
          }

          logger.debug('Batch completed by worker', {
            workerId,
            batchId: batch.id,
            batchSize: batch.size,
            executionTime: batchTime.toFixed(2) + 'ms'
          });

        } catch (error) {
          logger.error('Batch execution failed', {
            workerId,
            batchId: batch.id,
            error: error.message
          });

          this.workerStats[workerId].tasksFailed++;
          this.failedTasks++;
          
          // Store error result
          results[batch.id] = {
            error: error.message,
            batchId: batch.id,
            failed: true
          };
        }
      }

    } finally {
      this.workerStats[workerId].isActive = false;
      
      const workerTime = performance.now() - workerStartTime;
      logger.debug('Worker completed', {
        workerId,
        tasksCompleted: this.workerStats[workerId].tasksCompleted,
        tasksFailed: this.workerStats[workerId].tasksFailed,
        totalTime: workerTime.toFixed(2) + 'ms',
        workStolen: this.workerStats[workerId].workStolen
      });
    }
  }

  /**
   * Steal work from other workers
   */
  stealWork(stealerWorkerId) {
    // Find worker with most work
    let victimWorkerId = -1;
    let maxQueueSize = 1; // Only steal if victim has more than 1 task
    
    for (let i = 0; i < this.workerQueues.length; i++) {
      if (i !== stealerWorkerId && this.workerQueues[i].length > maxQueueSize) {
        maxQueueSize = this.workerQueues[i].length;
        victimWorkerId = i;
      }
    }

    if (victimWorkerId >= 0) {
      // Steal from the end of victim's queue (LIFO for better cache locality)
      const stolenBatch = this.workerQueues[victimWorkerId].pop();
      
      if (stolenBatch) {
        this.workerStats[stealerWorkerId].workStolen++;
        this.workerStats[victimWorkerId].workGiven++;
        this.metrics.workStealingCount++;
        
        logger.debug('Work stolen', {
          stealer: stealerWorkerId,
          victim: victimWorkerId,
          batchId: stolenBatch.id,
          victimQueueSize: this.workerQueues[victimWorkerId].length
        });
        
        return stolenBatch;
      }
    }

    return null;
  }

  /**
   * Execute with pipelining for large datasets
   */
  async executePipelined(batches, processor, options = {}) {
    const results = new Array(batches.length);
    const pipeline = new PipelineStage(this.config.maxConcurrency);
    
    logger.info('Starting pipelined execution', {
      batchCount: batches.length,
      stages: this.config.maxConcurrency
    });

    // Process batches through pipeline
    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      
      const result = await pipeline.process(async () => {
        return await processor(batch.items, batch.id);
      });
      
      results[batch.id] = result;
      this.completedTasks++;

      if (options.progressCallback) {
        options.progressCallback(this.completedTasks, batches.length);
      }
    }

    return this.reconstructOrderedResults(results, batches.length);
  }

  /**
   * Traditional parallel execution (fallback)
   */
  async executeTraditionalParallel(batches, processor, options = {}) {
    const results = new Array(batches.length);
    const semaphore = new Semaphore(this.config.maxConcurrency);

    const batchPromises = batches.map(async (batch) => {
      await semaphore.acquire();
      
      try {
        const result = await processor(batch.items, batch.id);
        results[batch.id] = result;
        this.completedTasks++;

        if (options.progressCallback) {
          options.progressCallback(this.completedTasks, batches.length);
        }

      } catch (error) {
        results[batch.id] = {
          error: error.message,
          batchId: batch.id,
          failed: true
        };
        this.failedTasks++;
      } finally {
        semaphore.release();
      }
    });

    await Promise.all(batchPromises);
    return this.reconstructOrderedResults(results, batches.length);
  }

  /**
   * Execute with timeout
   */
  async executeWithTimeout(fn, timeoutMs) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Task execution timeout after ${timeoutMs}ms`));
      }, timeoutMs);

      fn().then(result => {
        clearTimeout(timeout);
        resolve(result);
      }).catch(error => {
        clearTimeout(timeout);
        reject(error);
      });
    });
  }

  /**
   * Estimate batch complexity for intelligent scheduling
   */
  estimateBatchComplexity(batch) {
    // Simple heuristic based on batch characteristics
    let complexity = batch.length; // Base complexity
    
    // Add complexity for special transaction types
    batch.forEach(item => {
      if (item.amount && item.amount > 100000) complexity += 2;
      if (item.description && item.description.length > 100) complexity += 1;
      if (item.reference_number && item.reference_number.includes('COMPLEX')) complexity += 3;
    });
    
    return complexity;
  }

  /**
   * Calculate batch priority
   */
  calculateBatchPriority(batch) {
    let priority = 1; // Base priority
    
    // Higher priority for high-value transactions
    const hasHighValue = batch.some(item => item.amount && item.amount > 500000);
    if (hasHighValue) priority += 2;
    
    // Higher priority for urgent transactions
    const hasUrgent = batch.some(item => item.urgent || item.priority === 'high');
    if (hasUrgent) priority += 3;
    
    return priority;
  }

  /**
   * Reconstruct ordered results from parallel execution
   */
  reconstructOrderedResults(results, expectedLength) {
    const orderedResults = [];
    
    for (let i = 0; i < expectedLength; i++) {
      if (results[i]) {
        orderedResults.push(results[i]);
      }
    }
    
    return orderedResults;
  }

  /**
   * Update performance metrics
   */
  updateMetrics(batchCount, executionTime) {
    this.metrics.completedTasks += this.completedTasks;
    this.metrics.failedTasks += this.failedTasks;
    
    // Update average execution time
    const newAverage = (this.metrics.averageExecutionTime + executionTime) / 2;
    this.metrics.averageExecutionTime = newAverage;
    
    // Calculate throughput (batches per second)
    this.metrics.throughput = batchCount / (executionTime / 1000);
    
    // Calculate worker utilization
    this.metrics.workerUtilization = this.calculateWorkerUtilization();
  }

  /**
   * Calculate worker utilization
   */
  calculateWorkerUtilization() {
    if (this.workerStats.length === 0) return 0;
    
    const activeWorkers = this.workerStats.filter(stat => stat.isActive).length;
    return activeWorkers / this.workerStats.length;
  }

  /**
   * Get execution metrics
   */
  async getMetrics() {
    return {
      execution: {
        totalTasks: this.metrics.totalTasks,
        completedTasks: this.metrics.completedTasks,
        failedTasks: this.metrics.failedTasks,
        successRate: this.metrics.totalTasks > 0 ? 
          (this.metrics.completedTasks / this.metrics.totalTasks * 100).toFixed(1) + '%' : '0%'
      },
      performance: {
        averageExecutionTime: this.metrics.averageExecutionTime.toFixed(2) + 'ms',
        throughput: this.metrics.throughput.toFixed(2) + ' batches/sec',
        workerUtilization: (this.metrics.workerUtilization * 100).toFixed(1) + '%'
      },
      workStealing: {
        enabled: this.config.enableWorkStealing,
        stealingCount: this.metrics.workStealingCount,
        workerStats: this.workerStats.map(stat => ({
          id: stat.id,
          tasksCompleted: stat.tasksCompleted,
          workStolen: stat.workStolen,
          workGiven: stat.workGiven
        }))
      },
      configuration: {
        maxConcurrency: this.config.maxConcurrency,
        enableWorkStealing: this.config.enableWorkStealing,
        enablePipelining: this.config.enablePipelining,
        workerTimeout: this.config.workerTimeout + 'ms'
      }
    };
  }

  /**
   * Generate unique execution ID
   */
  generateExecutionId() {
    return 'exec_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
}

/**
 * Pipeline stage for pipelined execution
 */
class PipelineStage {
  constructor(concurrency) {
    this.concurrency = concurrency;
    this.activeCount = 0;
    this.waitingQueue = [];
  }

  async process(task) {
    if (this.activeCount < this.concurrency) {
      this.activeCount++;
      try {
        return await task();
      } finally {
        this.activeCount--;
        this.processWaiting();
      }
    } else {
      return new Promise((resolve, reject) => {
        this.waitingQueue.push({ task, resolve, reject });
      });
    }
  }

  processWaiting() {
    if (this.waitingQueue.length > 0 && this.activeCount < this.concurrency) {
      const { task, resolve, reject } = this.waitingQueue.shift();
      this.activeCount++;
      
      task().then(resolve).catch(reject).finally(() => {
        this.activeCount--;
        this.processWaiting();
      });
    }
  }
}

/**
 * Semaphore for controlling concurrency
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
EOF < /dev/null