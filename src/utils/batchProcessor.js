/**
 * Enhanced Batch Processing System for Cash Clearing Workflow
 * Implements dynamic sizing, parallel processing, checkpointing, and recovery mechanisms
 */

import { logger } from './logger.js';
import { retryCoordinator } from './retryStrategies.js';
import { errorClassifier } from './errorClassification.js';
import { chunks, calculateBatchMetrics } from './chunks.js';

/**
 * Batch processing strategies
 */
export const BATCH_STRATEGIES = {
  FIXED_SIZE: 'fixed_size',
  DYNAMIC_SIZE: 'dynamic_size',
  ADAPTIVE_SIZE: 'adaptive_size',
  LOAD_BALANCED: 'load_balanced'
};

/**
 * Batch execution modes
 */
export const EXECUTION_MODES = {
  SEQUENTIAL: 'sequential',
  PARALLEL: 'parallel',
  PIPELINE: 'pipeline',
  PRIORITY_QUEUE: 'priority_queue'
};

/**
 * Checkpoint strategies
 */
export const CHECKPOINT_STRATEGIES = {
  BATCH_COMPLETION: 'batch_completion',
  TIME_BASED: 'time_based',
  ITEM_COUNT: 'item_count',
  ERROR_THRESHOLD: 'error_threshold'
};

/**
 * Enhanced batch processor with advanced capabilities
 */
export class EnhancedBatchProcessor {
  constructor(options = {}) {
    this.config = {
      // Basic configuration
      defaultBatchSize: options.defaultBatchSize || 100,
      maxBatchSize: options.maxBatchSize || 1000,
      minBatchSize: options.minBatchSize || 10,
      maxConcurrency: options.maxConcurrency || 3,
      
      // Strategy configuration
      batchStrategy: options.batchStrategy || BATCH_STRATEGIES.DYNAMIC_SIZE,
      executionMode: options.executionMode || EXECUTION_MODES.PARALLEL,
      checkpointStrategy: options.checkpointStrategy || CHECKPOINT_STRATEGIES.BATCH_COMPLETION,
      
      // Advanced features
      enableCheckpointing: options.enableCheckpointing !== false,
      enableAdaptiveSizing: options.enableAdaptiveSizing !== false,
      enableLoadBalancing: options.enableLoadBalancing !== false,
      enablePrioritization: options.enablePrioritization || false,
      
      // Performance tuning
      performanceThresholds: {
        maxProcessingTime: options.maxProcessingTime || 300000, // 5 minutes
        maxMemoryUsage: options.maxMemoryUsage || 0.8, // 80% of available memory
        targetThroughput: options.targetThroughput || 1000, // items per minute
        errorRateThreshold: options.errorRateThreshold || 0.1 // 10% error rate
      },
      
      // Monitoring and metrics
      enableMetrics: options.enableMetrics !== false,
      metricsWindow: options.metricsWindow || 3600000, // 1 hour
      enableProfiling: options.enableProfiling || false
    };

    // State management
    this.activeProcessors = new Map();
    this.processingMetrics = new Map();
    this.checkpoints = new Map();
    this.adaptiveSizeHistory = [];
    this.errorPatterns = new Map();
    
    // Performance monitoring
    this.performanceHistory = [];
    this.resourceMonitor = new ResourceMonitor();
    
    // Priority queue for item processing
    this.priorityQueue = new PriorityQueue();
  }

  /**
   * Process items with enhanced batch processing capabilities
   */
  async processItems(items, processor, options = {}) {
    const processingId = this.generateProcessingId();
    const context = this.prepareProcessingContext(items, processor, options, processingId);
    
    try {
      logger.info('Starting enhanced batch processing', {
        processingId,
        itemCount: items.length,
        config: context.config
      });

      // Initialize processing state
      await this.initializeProcessingState(context);
      
      // Create optimized batches
      const batches = await this.createOptimizedBatches(items, context);
      
      // Execute batches with selected strategy
      const results = await this.executeBatches(batches, processor, context);
      
      // Finalize processing
      await this.finalizeProcessing(context, results);
      
      return this.createProcessingResult(results, context);

    } catch (error) {
      await this.handleProcessingError(error, context);
      throw error;
    } finally {
      this.cleanupProcessingState(processingId);
    }
  }

  /**
   * Prepare comprehensive processing context
   */
  prepareProcessingContext(items, processor, options, processingId) {
    return {
      processingId,
      processor,
      config: { ...this.config, ...options },
      items: {
        total: items.length,
        processed: 0,
        failed: 0,
        skipped: 0
      },
      timing: {
        startTime: Date.now(),
        lastCheckpoint: Date.now(),
        estimatedCompletion: null
      },
      state: {
        currentBatch: 0,
        totalBatches: 0,
        paused: false,
        cancelled: false
      },
      metrics: {
        throughput: [],
        errorRate: [],
        resourceUsage: [],
        adaptiveSizeHistory: []
      },
      errors: [],
      checkpoints: []
    };
  }

  /**
   * Initialize processing state and monitoring
   */
  async initializeProcessingState(context) {
    this.activeProcessors.set(context.processingId, context);
    
    if (context.config.enableMetrics) {
      this.processingMetrics.set(context.processingId, {
        startTime: context.timing.startTime,
        batchMetrics: [],
        errorMetrics: []
      });
    }

    // Start resource monitoring if enabled
    if (context.config.enableProfiling) {
      this.resourceMonitor.startMonitoring(context.processingId);
    }
  }

  /**
   * Create optimized batches using selected strategy
   */
  async createOptimizedBatches(items, context) {
    const batchSize = await this.calculateOptimalBatchSize(items, context);
    
    logger.info('Creating optimized batches', {
      processingId: context.processingId,
      strategy: context.config.batchStrategy,
      calculatedBatchSize: batchSize,
      itemCount: items.length
    });

    switch (context.config.batchStrategy) {
      case BATCH_STRATEGIES.FIXED_SIZE:
        return this.createFixedSizeBatches(items, batchSize);
      
      case BATCH_STRATEGIES.DYNAMIC_SIZE:
        return this.createDynamicSizeBatches(items, context);
      
      case BATCH_STRATEGIES.ADAPTIVE_SIZE:
        return this.createAdaptiveSizeBatches(items, context);
      
      case BATCH_STRATEGIES.LOAD_BALANCED:
        return this.createLoadBalancedBatches(items, context);
      
      default:
        return this.createFixedSizeBatches(items, batchSize);
    }
  }

  /**
   * Calculate optimal batch size based on multiple factors
   */
  async calculateOptimalBatchSize(items, context) {
    let optimalSize = context.config.defaultBatchSize;

    // Factor 1: Historical performance
    const historicalOptimal = this.getHistoricalOptimalSize(context);
    if (historicalOptimal) {
      optimalSize = historicalOptimal;
    }

    // Factor 2: Current system load
    const systemLoad = await this.resourceMonitor.getCurrentLoad();
    if (systemLoad > 0.8) {
      optimalSize = Math.max(context.config.minBatchSize, optimalSize * 0.7);
    } else if (systemLoad < 0.4) {
      optimalSize = Math.min(context.config.maxBatchSize, optimalSize * 1.3);
    }

    // Factor 3: Item characteristics
    const itemComplexity = this.analyzeItemComplexity(items.slice(0, 10)); // Sample first 10
    if (itemComplexity > 0.8) {
      optimalSize = Math.max(context.config.minBatchSize, optimalSize * 0.6);
    }

    // Factor 4: Error patterns
    const errorPattern = this.analyzeErrorPatterns(context);
    if (errorPattern.suggestedSizeReduction) {
      optimalSize = Math.max(context.config.minBatchSize, 
        optimalSize * (1 - errorPattern.suggestedSizeReduction));
    }

    return Math.floor(Math.max(context.config.minBatchSize, 
      Math.min(context.config.maxBatchSize, optimalSize)));
  }

  /**
   * Create fixed-size batches
   */
  createFixedSizeBatches(items, batchSize) {
    const batches = [];
    for (let i = 0; i < items.length; i += batchSize) {
      batches.push({
        id: `batch_${Math.floor(i / batchSize)}`,
        items: items.slice(i, i + batchSize),
        index: Math.floor(i / batchSize),
        priority: 'normal',
        estimatedProcessingTime: null
      });
    }
    return batches;
  }

  /**
   * Create dynamic-size batches based on item characteristics
   */
  createDynamicSizeBatches(items, context) {
    const batches = [];
    let currentBatch = [];
    let currentBatchWeight = 0;
    const targetWeight = this.calculateTargetBatchWeight(context);

    for (let i = 0; i < items.length; i++) {
      const itemWeight = this.calculateItemWeight(items[i]);
      
      if (currentBatch.length > 0 && 
          (currentBatchWeight + itemWeight > targetWeight || 
           currentBatch.length >= context.config.maxBatchSize)) {
        // Finalize current batch
        batches.push({
          id: `batch_${batches.length}`,
          items: [...currentBatch],
          index: batches.length,
          priority: this.calculateBatchPriority(currentBatch),
          estimatedProcessingTime: this.estimateBatchProcessingTime(currentBatch),
          weight: currentBatchWeight
        });
        
        currentBatch = [];
        currentBatchWeight = 0;
      }
      
      currentBatch.push(items[i]);
      currentBatchWeight += itemWeight;
    }

    // Add final batch if not empty
    if (currentBatch.length > 0) {
      batches.push({
        id: `batch_${batches.length}`,
        items: currentBatch,
        index: batches.length,
        priority: this.calculateBatchPriority(currentBatch),
        estimatedProcessingTime: this.estimateBatchProcessingTime(currentBatch),
        weight: currentBatchWeight
      });
    }

    return batches;
  }

  /**
   * Create adaptive-size batches using machine learning insights
   */
  createAdaptiveSizeBatches(items, context) {
    // Use historical performance data to predict optimal batch sizes
    const adaptiveModel = this.buildAdaptiveModel(context);
    const batches = [];
    let currentIndex = 0;

    while (currentIndex < items.length) {
      const remainingItems = items.length - currentIndex;
      const predictedOptimalSize = adaptiveModel.predictOptimalSize(
        items.slice(currentIndex, currentIndex + 50), // Sample for prediction
        remainingItems,
        context
      );

      const actualBatchSize = Math.min(
        predictedOptimalSize,
        remainingItems,
        context.config.maxBatchSize
      );

      const batchItems = items.slice(currentIndex, currentIndex + actualBatchSize);
      
      batches.push({
        id: `adaptive_batch_${batches.length}`,
        items: batchItems,
        index: batches.length,
        priority: this.calculateBatchPriority(batchItems),
        estimatedProcessingTime: adaptiveModel.predictProcessingTime(batchItems),
        adaptiveSize: actualBatchSize,
        confidence: adaptiveModel.getConfidence()
      });

      currentIndex += actualBatchSize;
    }

    return batches;
  }

  /**
   * Execute batches using selected execution mode
   */
  async executeBatches(batches, processor, context) {
    context.state.totalBatches = batches.length;
    
    logger.info('Executing batches', {
      processingId: context.processingId,
      executionMode: context.config.executionMode,
      batchCount: batches.length
    });

    switch (context.config.executionMode) {
      case EXECUTION_MODES.SEQUENTIAL:
        return await this.executeSequentialBatches(batches, processor, context);
      
      case EXECUTION_MODES.PARALLEL:
        return await this.executeParallelBatches(batches, processor, context);
      
      case EXECUTION_MODES.PIPELINE:
        return await this.executePipelineBatches(batches, processor, context);
      
      case EXECUTION_MODES.PRIORITY_QUEUE:
        return await this.executePriorityQueueBatches(batches, processor, context);
      
      default:
        return await this.executeParallelBatches(batches, processor, context);
    }
  }

  /**
   * Execute batches in parallel with sophisticated coordination
   */
  async executeParallelBatches(batches, processor, context) {
    const results = [];
    const activePromises = new Map();
    let batchIndex = 0;
    const maxConcurrency = Math.min(context.config.maxConcurrency, batches.length);

    // Initialize first set of concurrent batches
    while (activePromises.size < maxConcurrency && batchIndex < batches.length) {
      const batch = batches[batchIndex];
      const promise = this.executeSingleBatch(batch, processor, context);
      activePromises.set(batchIndex, promise);
      batchIndex++;
    }

    // Process batches as they complete
    while (activePromises.size > 0) {
      // Wait for at least one batch to complete
      const completedEntry = await this.waitForFirstCompletion(activePromises);
      const [completedIndex, result] = completedEntry;
      
      results[completedIndex] = result;
      activePromises.delete(completedIndex);
      
      // Update context and check for checkpoint
      await this.updateProcessingProgress(context, result);
      await this.checkCheckpointConditions(context);
      
      // Start next batch if available
      if (batchIndex < batches.length && !context.state.paused) {
        const batch = batches[batchIndex];
        const promise = this.executeSingleBatch(batch, processor, context);
        activePromises.set(batchIndex, promise);
        batchIndex++;
      }
    }

    return results;
  }

  /**
   * Execute single batch with comprehensive error handling and monitoring
   */
  async executeSingleBatch(batch, processor, context) {
    const batchStartTime = Date.now();
    const batchResult = {
      batchId: batch.id,
      batchIndex: batch.index,
      startTime: batchStartTime,
      endTime: null,
      duration: null,
      itemCount: batch.items.length,
      processed: 0,
      failed: 0,
      errors: [],
      metrics: {}
    };

    try {
      logger.debug('Starting batch execution', {
        processingId: context.processingId,
        batchId: batch.id,
        itemCount: batch.items.length
      });

      // Execute batch with retry coordination
      const result = await retryCoordinator.executeWithRetry(
        () => processor(batch.items, batch.index),
        {
          operationId: `${context.processingId}_${batch.id}`,
          operationName: 'batch_processing',
          maxRetries: 3,
          metadata: {
            processingId: context.processingId,
            batchId: batch.id,
            itemCount: batch.items.length
          }
        }
      );

      // Process successful result
      batchResult.processed = batch.items.length;
      batchResult.result = result;
      
      // Update adaptive sizing history
      if (context.config.enableAdaptiveSizing) {
        this.updateAdaptiveSizeHistory(batch, batchResult, context);
      }

    } catch (error) {
      // Handle batch failure
      logger.error('Batch execution failed', {
        processingId: context.processingId,
        batchId: batch.id,
        error: error.message
      });

      batchResult.failed = batch.items.length;
      batchResult.errors.push({
        error: error.message,
        code: error.code,
        timestamp: new Date().toISOString()
      });

      // Classify error for adaptive learning
      const classification = errorClassifier.classifyError(error, {
        processingId: context.processingId,
        batchId: batch.id,
        batchSize: batch.items.length
      });

      // Update error patterns
      this.updateErrorPatterns(classification, batch, context);

      // Decide whether to continue or fail fast
      if (this.shouldFailFast(classification, context)) {
        context.state.cancelled = true;
        throw error;
      }
    } finally {
      batchResult.endTime = Date.now();
      batchResult.duration = batchResult.endTime - batchResult.startTime;
      
      // Record metrics
      this.recordBatchMetrics(batchResult, context);
    }

    return batchResult;
  }

  /**
   * Update processing progress and calculate metrics
   */
  async updateProcessingProgress(context, batchResult) {
    context.items.processed += batchResult.processed;
    context.items.failed += batchResult.failed;
    context.state.currentBatch++;

    // Calculate progress metrics
    const progressPercent = (context.items.processed + context.items.failed) / context.items.total;
    const elapsedTime = Date.now() - context.timing.startTime;
    const estimatedTotalTime = elapsedTime / progressPercent;
    context.timing.estimatedCompletion = context.timing.startTime + estimatedTotalTime;

    // Calculate throughput
    const throughput = context.items.processed / (elapsedTime / 60000); // items per minute
    context.metrics.throughput.push({
      timestamp: Date.now(),
      value: throughput
    });

    // Calculate error rate
    const errorRate = context.items.failed / (context.items.processed + context.items.failed);
    context.metrics.errorRate.push({
      timestamp: Date.now(),
      value: errorRate
    });

    logger.debug('Processing progress updated', {
      processingId: context.processingId,
      progress: `${Math.round(progressPercent * 100)}%`,
      throughput: `${Math.round(throughput)} items/min`,
      errorRate: `${Math.round(errorRate * 100)}%`,
      estimatedCompletion: new Date(context.timing.estimatedCompletion).toISOString()
    });
  }

  /**
   * Check checkpoint conditions and save state if needed
   */
  async checkCheckpointConditions(context) {
    if (!context.config.enableCheckpointing) return;

    let shouldCheckpoint = false;
    const now = Date.now();

    switch (context.config.checkpointStrategy) {
      case CHECKPOINT_STRATEGIES.BATCH_COMPLETION:
        shouldCheckpoint = context.state.currentBatch % 10 === 0; // Every 10 batches
        break;
      
      case CHECKPOINT_STRATEGIES.TIME_BASED:
        shouldCheckpoint = (now - context.timing.lastCheckpoint) > 300000; // Every 5 minutes
        break;
      
      case CHECKPOINT_STRATEGIES.ITEM_COUNT:
        shouldCheckpoint = context.items.processed % 1000 === 0; // Every 1000 items
        break;
      
      case CHECKPOINT_STRATEGIES.ERROR_THRESHOLD:
        const errorRate = context.items.failed / (context.items.processed + context.items.failed);
        shouldCheckpoint = errorRate > context.config.performanceThresholds.errorRateThreshold;
        break;
    }

    if (shouldCheckpoint) {
      await this.createCheckpoint(context);
    }
  }

  /**
   * Create checkpoint for recovery purposes
   */
  async createCheckpoint(context) {
    const checkpoint = {
      processingId: context.processingId,
      timestamp: new Date().toISOString(),
      progress: {
        currentBatch: context.state.currentBatch,
        totalBatches: context.state.totalBatches,
        itemsProcessed: context.items.processed,
        itemsFailed: context.items.failed
      },
      metrics: {
        throughput: context.metrics.throughput.slice(-5), // Last 5 measurements
        errorRate: context.metrics.errorRate.slice(-5)
      },
      state: { ...context.state }
    };

    this.checkpoints.set(context.processingId, checkpoint);
    context.checkpoints.push(checkpoint);
    context.timing.lastCheckpoint = Date.now();

    logger.info('Checkpoint created', {
      processingId: context.processingId,
      progress: `${Math.round((context.items.processed + context.items.failed) / context.items.total * 100)}%`,
      checkpointCount: context.checkpoints.length
    });
  }

  /**
   * Resume processing from checkpoint
   */
  async resumeFromCheckpoint(checkpointId, items, processor, options = {}) {
    const checkpoint = this.checkpoints.get(checkpointId);
    if (!checkpoint) {
      throw new Error(`Checkpoint not found: ${checkpointId}`);
    }

    logger.info('Resuming processing from checkpoint', {
      checkpointId,
      checkpointTimestamp: checkpoint.timestamp,
      previousProgress: checkpoint.progress
    });

    // Calculate remaining items
    const processedCount = checkpoint.progress.itemsProcessed + checkpoint.progress.itemsFailed;
    const remainingItems = items.slice(processedCount);

    // Resume processing with updated context
    const resumeOptions = {
      ...options,
      resumeFromCheckpoint: true,
      previousProgress: checkpoint.progress,
      previousMetrics: checkpoint.metrics
    };

    return await this.processItems(remainingItems, processor, resumeOptions);
  }

  /**
   * Utility methods for analysis and optimization
   */
  analyzeItemComplexity(sampleItems) {
    // Simple heuristic for item complexity
    let totalComplexity = 0;
    
    for (const item of sampleItems) {
      let complexity = 0.1; // Base complexity
      
      // Increase complexity based on item characteristics
      if (item.amount && item.amount > 100000) complexity += 0.2;
      if (item.description && item.description.length > 100) complexity += 0.2;
      if (item.reference_number && item.reference_number.includes('COMPLEX')) complexity += 0.3;
      
      totalComplexity += complexity;
    }
    
    return sampleItems.length > 0 ? totalComplexity / sampleItems.length : 0.5;
  }

  calculateItemWeight(item) {
    // Calculate processing weight for load balancing
    let weight = 1; // Base weight
    
    if (item.amount) {
      weight += Math.log10(item.amount) * 0.1;
    }
    
    if (item.description) {
      weight += item.description.length / 1000;
    }
    
    return Math.min(weight, 5); // Cap at 5x base weight
  }

  calculateTargetBatchWeight(context) {
    const systemLoad = this.resourceMonitor.getCurrentLoadSync();
    const baseWeight = context.config.defaultBatchSize;
    
    if (systemLoad > 0.8) {
      return baseWeight * 0.6;
    } else if (systemLoad < 0.4) {
      return baseWeight * 1.4;
    }
    
    return baseWeight;
  }

  calculateBatchPriority(items) {
    // Calculate priority based on item characteristics
    let priority = 'normal';
    
    const hasHighValue = items.some(item => item.amount && item.amount > 500000);
    const hasUrgentFlag = items.some(item => item.urgent || item.priority === 'high');
    
    if (hasUrgentFlag) priority = 'high';
    else if (hasHighValue) priority = 'medium';
    
    return priority;
  }

  estimateBatchProcessingTime(items) {
    const complexity = this.analyzeItemComplexity(items);
    const baseTimePerItem = 500; // ms
    return items.length * baseTimePerItem * (1 + complexity);
  }

  /**
   * Resource monitoring integration
   */
  async waitForFirstCompletion(promiseMap) {
    const promises = Array.from(promiseMap.entries()).map(([key, promise]) =>
      promise.then(result => [key, result])
    );
    
    return await Promise.race(promises);
  }

  shouldFailFast(classification, context) {
    // Fail fast on critical errors or if error rate is too high
    if (classification.analysis.primary.severity.level <= 2) {
      return true;
    }
    
    const errorRate = context.items.failed / (context.items.processed + context.items.failed);
    return errorRate > context.config.performanceThresholds.errorRateThreshold * 2;
  }

  /**
   * Metrics and monitoring
   */
  recordBatchMetrics(batchResult, context) {
    if (!context.config.enableMetrics) return;
    
    const metrics = this.processingMetrics.get(context.processingId);
    if (metrics) {
      metrics.batchMetrics.push({
        batchId: batchResult.batchId,
        duration: batchResult.duration,
        itemCount: batchResult.itemCount,
        processed: batchResult.processed,
        failed: batchResult.failed,
        timestamp: batchResult.endTime
      });
    }
  }

  updateAdaptiveSizeHistory(batch, batchResult, context) {
    this.adaptiveSizeHistory.push({
      batchSize: batch.items.length,
      processingTime: batchResult.duration,
      successRate: batchResult.processed / batch.items.length,
      timestamp: Date.now(),
      context: {
        systemLoad: this.resourceMonitor.getCurrentLoadSync(),
        totalBatches: context.state.totalBatches
      }
    });
    
    // Maintain sliding window
    if (this.adaptiveSizeHistory.length > 1000) {
      this.adaptiveSizeHistory = this.adaptiveSizeHistory.slice(-1000);
    }
  }

  updateErrorPatterns(classification, batch, context) {
    const patternKey = `${classification.analysis.primary.category}_${classification.analysis.primary.subcategory}`;
    
    if (!this.errorPatterns.has(patternKey)) {
      this.errorPatterns.set(patternKey, {
        count: 0,
        batchSizes: [],
        suggestedSizeReduction: 0
      });
    }
    
    const pattern = this.errorPatterns.get(patternKey);
    pattern.count++;
    pattern.batchSizes.push(batch.items.length);
    
    // Calculate suggested size reduction based on error frequency
    if (pattern.count > 5) {
      const avgFailedBatchSize = pattern.batchSizes.reduce((a, b) => a + b, 0) / pattern.batchSizes.length;
      const currentBatchSize = context.config.defaultBatchSize;
      
      if (avgFailedBatchSize > currentBatchSize * 0.8) {
        pattern.suggestedSizeReduction = Math.min(0.5, pattern.count * 0.05);
      }
    }
  }

  analyzeErrorPatterns(context) {
    let maxSuggestion = 0;
    
    for (const pattern of this.errorPatterns.values()) {
      if (pattern.suggestedSizeReduction > maxSuggestion) {
        maxSuggestion = pattern.suggestedSizeReduction;
      }
    }
    
    return { suggestedSizeReduction: maxSuggestion };
  }

  getHistoricalOptimalSize(context) {
    if (this.adaptiveSizeHistory.length < 10) return null;
    
    // Find batch sizes with best performance
    const recentHistory = this.adaptiveSizeHistory.slice(-50);
    const performanceBySize = new Map();
    
    recentHistory.forEach(entry => {
      const size = entry.batchSize;
      const performance = entry.successRate / (entry.processingTime / entry.batchSize); // Items per ms
      
      if (!performanceBySize.has(size)) {
        performanceBySize.set(size, []);
      }
      performanceBySize.get(size).push(performance);
    });
    
    // Calculate average performance for each size
    let bestSize = null;
    let bestPerformance = 0;
    
    for (const [size, performances] of performanceBySize.entries()) {
      const avgPerformance = performances.reduce((a, b) => a + b, 0) / performances.length;
      if (avgPerformance > bestPerformance) {
        bestPerformance = avgPerformance;
        bestSize = size;
      }
    }
    
    return bestSize;
  }

  buildAdaptiveModel(context) {
    // Simple adaptive model for batch size prediction
    return {
      predictOptimalSize: (sampleItems, remainingCount, context) => {
        const complexity = this.analyzeItemComplexity(sampleItems);
        const baseSize = context.config.defaultBatchSize;
        const systemLoad = this.resourceMonitor.getCurrentLoadSync();
        
        let predictedSize = baseSize;
        
        // Adjust for complexity
        predictedSize *= (1 - complexity * 0.5);
        
        // Adjust for system load
        predictedSize *= (1 - systemLoad * 0.3);
        
        // Adjust for remaining items
        if (remainingCount < baseSize) {
          predictedSize = remainingCount;
        }
        
        return Math.max(context.config.minBatchSize, 
          Math.min(context.config.maxBatchSize, Math.floor(predictedSize)));
      },
      
      predictProcessingTime: (items) => {
        return this.estimateBatchProcessingTime(items);
      },
      
      getConfidence: () => {
        return this.adaptiveSizeHistory.length > 50 ? 0.8 : 0.4;
      }
    };
  }

  /**
   * Create final processing result
   */
  createProcessingResult(batchResults, context) {
    const totalDuration = Date.now() - context.timing.startTime;
    const successfulBatches = batchResults.filter(r => r.failed === 0).length;
    const totalErrors = batchResults.reduce((sum, r) => sum + r.errors.length, 0);
    
    return {
      processingId: context.processingId,
      summary: {
        totalItems: context.items.total,
        processed: context.items.processed,
        failed: context.items.failed,
        successRate: context.items.processed / context.items.total,
        totalBatches: batchResults.length,
        successfulBatches,
        totalDuration,
        averageThroughput: context.items.processed / (totalDuration / 60000) // items per minute
      },
      batchResults,
      metrics: context.metrics,
      checkpoints: context.checkpoints,
      errors: context.errors.concat(batchResults.flatMap(r => r.errors)),
      performance: {
        optimalBatchSize: this.getHistoricalOptimalSize(context) || context.config.defaultBatchSize,
        errorPatterns: Array.from(this.errorPatterns.entries()),
        adaptiveInsights: this.adaptiveSizeHistory.slice(-10)
      }
    };
  }

  finalizeProcessing(context, results) {
    logger.info('Batch processing completed', {
      processingId: context.processingId,
      totalDuration: Date.now() - context.timing.startTime,
      itemsProcessed: context.items.processed,
      itemsFailed: context.items.failed,
      batchCount: results.length
    });
  }

  handleProcessingError(error, context) {
    logger.error('Batch processing failed', {
      processingId: context.processingId,
      error: error.message,
      duration: Date.now() - context.timing.startTime,
      progress: context.items.processed + context.items.failed
    });
  }

  cleanupProcessingState(processingId) {
    this.activeProcessors.delete(processingId);
    this.resourceMonitor.stopMonitoring(processingId);
  }

  generateProcessingId() {
    return `proc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Simple resource monitor for system load tracking
 */
class ResourceMonitor {
  constructor() {
    this.monitoringState = new Map();
    this.currentLoad = 0.5; // Simulated load
  }

  async getCurrentLoad() {
    // In a real implementation, this would check actual system resources
    return this.currentLoad;
  }

  getCurrentLoadSync() {
    return this.currentLoad;
  }

  startMonitoring(processingId) {
    this.monitoringState.set(processingId, {
      startTime: Date.now(),
      active: true
    });
  }

  stopMonitoring(processingId) {
    this.monitoringState.delete(processingId);
  }
}

/**
 * Priority queue for batch processing
 */
class PriorityQueue {
  constructor() {
    this.items = [];
  }

  enqueue(item, priority) {
    this.items.push({ item, priority });
    this.items.sort((a, b) => b.priority - a.priority);
  }

  dequeue() {
    return this.items.shift()?.item;
  }

  size() {
    return this.items.length;
  }
}

// Export singleton instance
export const batchProcessor = new EnhancedBatchProcessor();

/**
 * Convenience function for processing items with enhanced batch capabilities
 */
export async function processWithEnhancedBatching(items, processor, options = {}) {
  return await batchProcessor.processItems(items, processor, options);
}