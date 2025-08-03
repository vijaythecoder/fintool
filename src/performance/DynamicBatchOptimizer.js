/**
 * Dynamic Batch Size Optimizer
 * Uses machine learning techniques to optimize batch sizes based on system performance
 */

import { logger } from '../utils/logger.js';

export class DynamicBatchOptimizer {
  constructor(options = {}) {
    this.config = {
      initialBatchSize: options.initialBatchSize || 100,
      maxBatchSize: options.maxBatchSize || 2000,
      minBatchSize: options.minBatchSize || 25,
      targetThroughput: options.targetThroughput || 50000, // transactions per hour
      adaptiveThreshold: options.adaptiveThreshold || 0.1,
      learningRate: options.learningRate || 0.01
    };

    // Performance history for ML-based optimization
    this.performanceHistory = [];
    this.currentOptimalSize = this.config.initialBatchSize;
    this.consecutiveFailures = 0;
    this.lastOptimizationTime = Date.now();
    
    // System load indicators
    this.systemMetrics = {
      cpuUsage: 0.5,
      memoryUsage: 0.5,
      networkLatency: 100,
      errorRate: 0.0
    };
  }

  /**
   * Optimize batch size based on current system performance
   */
  async optimizeBatchSize(transactionCount, processingTime, currentMetrics = {}) {
    const optimizationStartTime = performance.now();
    
    try {
      // Update system metrics
      await this.updateSystemMetrics(currentMetrics);
      
      // Calculate current performance indicators
      const currentPerformance = this.calculatePerformanceIndicators(
        this.currentOptimalSize,
        processingTime,
        transactionCount
      );
      
      // Add to performance history
      this.addPerformanceRecord(currentPerformance);
      
      // Apply optimization algorithm
      const optimizedSize = await this.applyOptimizationAlgorithm(currentPerformance);
      
      // Validate and clamp the optimized size
      const finalSize = this.validateBatchSize(optimizedSize);
      
      logger.info('Batch size optimization completed', {
        originalSize: this.currentOptimalSize,
        optimizedSize: finalSize,
        optimizationRatio: (finalSize / this.currentOptimalSize).toFixed(2),
        systemLoad: this.getSystemLoadSummary(),
        optimizationTime: (performance.now() - optimizationStartTime).toFixed(2) + 'ms'
      });
      
      this.currentOptimalSize = finalSize;
      return finalSize;
      
    } catch (error) {
      logger.error('Batch size optimization failed', { error: error.message });
      this.consecutiveFailures++;
      
      // Fallback to safe batch size
      if (this.consecutiveFailures > 3) {
        const safeSize = Math.max(this.config.minBatchSize, this.config.initialBatchSize * 0.5);
        logger.warn('Using fallback batch size due to optimization failures', { safeSize });
        return safeSize;
      }
      
      return this.currentOptimalSize;
    }
  }

  /**
   * Apply ML-based optimization algorithm
   */
  async applyOptimizationAlgorithm(currentPerformance) {
    if (this.performanceHistory.length < 3) {
      // Not enough data for optimization
      return this.gradientBasedAdjustment(currentPerformance);
    }

    // Use historical data for prediction
    const predictedOptimal = await this.predictOptimalBatchSize();
    
    // Apply reinforcement learning concepts
    const reinforcementAdjustment = this.calculateReinforcementAdjustment(currentPerformance);
    
    // Combine predictions with reinforcement learning
    const combinedOptimal = this.combineOptimizationStrategies(
      predictedOptimal,
      reinforcementAdjustment,
      currentPerformance
    );
    
    return combinedOptimal;
  }

  /**
   * Predict optimal batch size using historical performance
   */
  async predictOptimalBatchSize() {
    const recentHistory = this.performanceHistory.slice(-20); // Last 20 records
    
    // Simple linear regression on batch size vs throughput
    const regressionModel = this.buildLinearRegressionModel(recentHistory);
    
    // Find batch size that maximizes predicted throughput
    let maxThroughput = 0;
    let optimalSize = this.currentOptimalSize;
    
    for (let size = this.config.minBatchSize; size <= this.config.maxBatchSize; size += 25) {
      const predictedThroughput = this.predictThroughput(regressionModel, size);
      
      if (predictedThroughput > maxThroughput) {
        maxThroughput = predictedThroughput;
        optimalSize = size;
      }
    }
    
    logger.debug('Predicted optimal batch size', {
      predictedSize: optimalSize,
      predictedThroughput: maxThroughput.toFixed(2),
      confidence: this.calculatePredictionConfidence(recentHistory)
    });
    
    return optimalSize;
  }

  /**
   * Build simple linear regression model
   */
  buildLinearRegressionModel(data) {
    if (data.length < 2) return { slope: 0, intercept: this.config.targetThroughput };
    
    const n = data.length;
    const sumX = data.reduce((sum, record) => sum + record.batchSize, 0);
    const sumY = data.reduce((sum, record) => sum + record.throughput, 0);
    const sumXY = data.reduce((sum, record) => sum + (record.batchSize * record.throughput), 0);
    const sumXX = data.reduce((sum, record) => sum + (record.batchSize * record.batchSize), 0);
    
    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    const intercept = (sumY - slope * sumX) / n;
    
    return { slope, intercept };
  }

  /**
   * Predict throughput for a given batch size
   */
  predictThroughput(model, batchSize) {
    return Math.max(0, model.slope * batchSize + model.intercept);
  }

  /**
   * Calculate reinforcement learning adjustment
   */
  calculateReinforcementAdjustment(currentPerformance) {
    const recentHistory = this.performanceHistory.slice(-5);
    
    if (recentHistory.length < 2) {
      return this.currentOptimalSize;
    }
    
    // Calculate performance trend
    const performanceTrend = this.calculatePerformanceTrend(recentHistory);
    
    // Reward or penalty based on performance
    let adjustment = 0;
    
    if (performanceTrend.throughputTrend > 0 && performanceTrend.errorTrend <= 0) {
      // Performance improving - increase batch size
      adjustment = Math.min(100, this.currentOptimalSize * 0.1);
    } else if (performanceTrend.throughputTrend < 0 || performanceTrend.errorTrend > 0) {
      // Performance degrading - decrease batch size
      adjustment = -Math.min(50, this.currentOptimalSize * 0.1);
    }
    
    return this.currentOptimalSize + adjustment;
  }

  /**
   * Gradient-based adjustment for initial optimization
   */
  gradientBasedAdjustment(currentPerformance) {
    const systemLoad = this.getSystemLoad();
    
    // Base adjustment on system load and performance
    let adjustment = 0;
    
    if (systemLoad < 0.5 && currentPerformance.errorRate < 0.01) {
      // Low load, low errors - increase batch size
      adjustment = Math.min(50, this.currentOptimalSize * 0.2);
    } else if (systemLoad > 0.8 || currentPerformance.errorRate > 0.05) {
      // High load or high errors - decrease batch size
      adjustment = -Math.min(25, this.currentOptimalSize * 0.2);
    }
    
    return this.currentOptimalSize + adjustment;
  }

  /**
   * Combine different optimization strategies
   */
  combineOptimizationStrategies(predicted, reinforcement, currentPerformance) {
    const weights = {
      predicted: 0.6,
      reinforcement: 0.3,
      current: 0.1
    };
    
    // Weighted average of different strategies
    const combinedSize = 
      weights.predicted * predicted +
      weights.reinforcement * reinforcement +
      weights.current * this.currentOptimalSize;
    
    // Apply system load constraints
    const systemLoad = this.getSystemLoad();
    const loadAdjustment = 1 - (systemLoad - 0.5) * 0.3; // Reduce size under high load
    
    return Math.round(combinedSize * Math.max(0.5, loadAdjustment));
  }

  /**
   * Calculate performance indicators
   */
  calculatePerformanceIndicators(batchSize, processingTime, transactionCount) {
    const throughput = transactionCount / (processingTime / 1000 / 60); // transactions per minute
    const latency = processingTime / transactionCount; // ms per transaction
    const efficiency = throughput / batchSize; // throughput per batch unit
    
    return {
      batchSize,
      throughput,
      latency,
      efficiency,
      errorRate: this.systemMetrics.errorRate,
      timestamp: Date.now(),
      systemLoad: this.getSystemLoad()
    };
  }

  /**
   * Add performance record to history
   */
  addPerformanceRecord(performance) {
    this.performanceHistory.push(performance);
    
    // Maintain sliding window
    if (this.performanceHistory.length > 100) {
      this.performanceHistory = this.performanceHistory.slice(-100);
    }
    
    // Reset consecutive failures on successful record
    this.consecutiveFailures = 0;
  }

  /**
   * Calculate performance trends
   */
  calculatePerformanceTrend(history) {
    if (history.length < 2) {
      return { throughputTrend: 0, errorTrend: 0 };
    }
    
    const recent = history.slice(-3);
    const older = history.slice(-6, -3);
    
    const recentAvgThroughput = recent.reduce((sum, r) => sum + r.throughput, 0) / recent.length;
    const olderAvgThroughput = older.length > 0 ? 
      older.reduce((sum, r) => sum + r.throughput, 0) / older.length : recentAvgThroughput;
    
    const recentAvgErrors = recent.reduce((sum, r) => sum + r.errorRate, 0) / recent.length;
    const olderAvgErrors = older.length > 0 ? 
      older.reduce((sum, r) => sum + r.errorRate, 0) / older.length : recentAvgErrors;
    
    return {
      throughputTrend: recentAvgThroughput - olderAvgThroughput,
      errorTrend: recentAvgErrors - olderAvgErrors
    };
  }

  /**
   * Update system metrics
   */
  async updateSystemMetrics(currentMetrics) {
    // In a real implementation, this would collect actual system metrics
    this.systemMetrics = {
      cpuUsage: currentMetrics.cpuUsage || this.getSimulatedCPUUsage(),
      memoryUsage: currentMetrics.memoryUsage || this.getSimulatedMemoryUsage(),
      networkLatency: currentMetrics.networkLatency || this.getSimulatedNetworkLatency(),
      errorRate: currentMetrics.errorRate || 0.0
    };
  }

  /**
   * Get overall system load (0.0 - 1.0)
   */
  getSystemLoad() {
    return (this.systemMetrics.cpuUsage + this.systemMetrics.memoryUsage) / 2;
  }

  /**
   * Get system load summary
   */
  getSystemLoadSummary() {
    return {
      overall: this.getSystemLoad(),
      cpu: this.systemMetrics.cpuUsage,
      memory: this.systemMetrics.memoryUsage,
      network: this.systemMetrics.networkLatency,
      errors: this.systemMetrics.errorRate
    };
  }

  /**
   * Validate and clamp batch size
   */
  validateBatchSize(size) {
    return Math.max(
      this.config.minBatchSize,
      Math.min(this.config.maxBatchSize, Math.round(size))
    );
  }

  /**
   * Calculate prediction confidence
   */
  calculatePredictionConfidence(data) {
    if (data.length < 5) return 0.3;
    
    // Calculate variance in performance
    const throughputs = data.map(d => d.throughput);
    const avgThroughput = throughputs.reduce((sum, t) => sum + t, 0) / throughputs.length;
    const variance = throughputs.reduce((sum, t) => sum + Math.pow(t - avgThroughput, 2), 0) / throughputs.length;
    const stdDev = Math.sqrt(variance);
    
    // Higher confidence with lower variance
    const confidence = Math.max(0.1, Math.min(0.9, 1 - (stdDev / avgThroughput)));
    
    return confidence;
  }

  /**
   * Get optimization metrics
   */
  async getMetrics() {
    return {
      currentOptimalSize: this.currentOptimalSize,
      performanceHistoryLength: this.performanceHistory.length,
      consecutiveFailures: this.consecutiveFailures,
      systemLoad: this.getSystemLoadSummary(),
      recentPerformance: this.performanceHistory.slice(-5),
      optimizationEfficiency: this.calculateOptimizationEfficiency()
    };
  }

  /**
   * Calculate optimization efficiency
   */
  calculateOptimizationEfficiency() {
    if (this.performanceHistory.length < 10) return 0.5;
    
    const recent = this.performanceHistory.slice(-10);
    const initial = this.performanceHistory.slice(0, 10);
    
    const recentAvgThroughput = recent.reduce((sum, r) => sum + r.throughput, 0) / recent.length;
    const initialAvgThroughput = initial.reduce((sum, r) => sum + r.throughput, 0) / initial.length;
    
    return recentAvgThroughput / initialAvgThroughput;
  }

  // Simulation methods for testing
  getSimulatedCPUUsage() {
    return 0.3 + Math.random() * 0.4; // 30-70%
  }

  getSimulatedMemoryUsage() {
    return 0.4 + Math.random() * 0.3; // 40-70%
  }

  getSimulatedNetworkLatency() {
    return 50 + Math.random() * 100; // 50-150ms
  }
}
EOF < /dev/null