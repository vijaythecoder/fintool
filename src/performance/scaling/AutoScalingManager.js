/**
 * Auto-Scaling Manager for Cash Clearing System
 * Handles dynamic resource allocation and load balancing
 */

import { logger } from '../../utils/logger.js';
import { PerformanceMonitor } from '../monitoring/PerformanceMonitor.js';

export class AutoScalingManager {
  constructor(options = {}) {
    this.config = {
      minInstances: options.minInstances || 2,
      maxInstances: options.maxInstances || 20,
      targetCPUUtilization: options.targetCPUUtilization || 0.7, // 70%
      targetMemoryUtilization: options.targetMemoryUtilization || 0.8, // 80%
      scaleUpThreshold: options.scaleUpThreshold || 0.8, // 80%
      scaleDownThreshold: options.scaleDownThreshold || 0.3, // 30%
      cooldownPeriod: options.cooldownPeriod || 300000, // 5 minutes
      evaluationPeriod: options.evaluationPeriod || 60000, // 1 minute
      enablePredictiveScaling: options.enablePredictiveScaling !== false
    };

    // Scaling state
    this.currentInstances = this.config.minInstances;
    this.lastScalingAction = null;
    this.scalingHistory = [];
    this.resourceMetrics = new Map();
    
    // Load prediction model
    this.loadPredictor = new LoadPredictor();
    this.performanceMonitor = new PerformanceMonitor();
    
    // Scaling timer
    this.scalingTimer = null;
    
    // Start monitoring
    this.startScalingMonitoring();
  }

  /**
   * Start auto-scaling monitoring
   */
  startScalingMonitoring() {
    this.scalingTimer = setInterval(async () => {
      await this.evaluateScalingDecision();
    }, this.config.evaluationPeriod);

    logger.info('Auto-scaling monitoring started', {
      evaluationPeriod: this.config.evaluationPeriod + 'ms',
      minInstances: this.config.minInstances,
      maxInstances: this.config.maxInstances
    });
  }

  /**
   * Evaluate scaling decision based on current metrics
   */
  async evaluateScalingDecision() {
    try {
      // Collect current resource metrics
      const metrics = await this.collectResourceMetrics();
      
      // Check cooldown period
      if (this.isInCooldownPeriod()) {
        logger.debug('Scaling evaluation skipped - in cooldown period');
        return;
      }

      // Calculate scaling recommendation
      const recommendation = await this.calculateScalingRecommendation(metrics);
      
      // Apply scaling decision
      if (recommendation.action !== 'NONE') {
        await this.executeScalingAction(recommendation);
      }

      // Update metrics history
      this.updateMetricsHistory(metrics);

    } catch (error) {
      logger.error('Auto-scaling evaluation failed', { error: error.message });
    }
  }

  /**
   * Collect current resource metrics
   */
  async collectResourceMetrics() {
    const snapshot = await this.performanceMonitor.getPerformanceSnapshot();
    
    const metrics = {
      timestamp: Date.now(),
      cpuUtilization: snapshot.systemMetrics.cpuUsage,
      memoryUtilization: snapshot.systemMetrics.memoryUsage,
      responseTime: snapshot.responseTime.avg,
      throughput: snapshot.throughput.avg,
      errorRate: snapshot.errorRate.avg,
      activeConnections: snapshot.systemMetrics.activeConnections,
      queueLength: this.getQueueLength(),
      currentInstances: this.currentInstances
    };

    return metrics;
  }

  /**
   * Calculate scaling recommendation
   */
  async calculateScalingRecommendation(metrics) {
    const recommendation = {
      action: 'NONE',
      targetInstances: this.currentInstances,
      reason: '',
      confidence: 0,
      priority: 'LOW'
    };

    // CPU-based scaling
    const cpuRecommendation = this.evaluateCPUScaling(metrics);
    
    // Memory-based scaling
    const memoryRecommendation = this.evaluateMemoryScaling(metrics);
    
    // Throughput-based scaling
    const throughputRecommendation = this.evaluateThroughputScaling(metrics);
    
    // Queue length-based scaling
    const queueRecommendation = this.evaluateQueueScaling(metrics);

    // Combine recommendations
    const recommendations = [
      cpuRecommendation,
      memoryRecommendation,
      throughputRecommendation,
      queueRecommendation
    ];

    // Find the most critical recommendation
    const criticalRecommendation = recommendations
      .filter(r => r.action !== 'NONE')
      .sort((a, b) => this.getActionPriority(b.action) - this.getActionPriority(a.action))[0];

    if (criticalRecommendation) {
      Object.assign(recommendation, criticalRecommendation);
    }

    // Apply predictive scaling if enabled
    if (this.config.enablePredictiveScaling && recommendation.action === 'NONE') {
      const predictiveRecommendation = await this.evaluatePredictiveScaling(metrics);
      if (predictiveRecommendation.action !== 'NONE') {
        Object.assign(recommendation, predictiveRecommendation);
        recommendation.reason += ' (Predictive)';
      }
    }

    return recommendation;
  }

  /**
   * Evaluate CPU-based scaling
   */
  evaluateCPUScaling(metrics) {
    const cpuUtilization = metrics.cpuUtilization;
    
    if (cpuUtilization > this.config.scaleUpThreshold) {
      const targetInstances = Math.min(
        this.config.maxInstances,
        Math.ceil(this.currentInstances * (cpuUtilization / this.config.targetCPUUtilization))
      );
      
      return {
        action: 'SCALE_UP',
        targetInstances,
        reason: 'High CPU utilization: ' + (cpuUtilization * 100).toFixed(1) + '%',
        confidence: Math.min(1, (cpuUtilization - this.config.scaleUpThreshold) * 2),
        priority: 'HIGH'
      };
    } else if (cpuUtilization < this.config.scaleDownThreshold && this.currentInstances > this.config.minInstances) {
      const targetInstances = Math.max(
        this.config.minInstances,
        Math.floor(this.currentInstances * (cpuUtilization / this.config.targetCPUUtilization))
      );
      
      return {
        action: 'SCALE_DOWN',
        targetInstances,
        reason: 'Low CPU utilization: ' + (cpuUtilization * 100).toFixed(1) + '%',
        confidence: Math.min(1, (this.config.scaleDownThreshold - cpuUtilization) * 2),
        priority: 'MEDIUM'
      };
    }

    return { action: 'NONE' };
  }

  /**
   * Evaluate memory-based scaling
   */
  evaluateMemoryScaling(metrics) {
    const memoryUtilization = metrics.memoryUtilization;
    
    if (memoryUtilization > this.config.scaleUpThreshold) {
      const targetInstances = Math.min(
        this.config.maxInstances,
        Math.ceil(this.currentInstances * (memoryUtilization / this.config.targetMemoryUtilization))
      );
      
      return {
        action: 'SCALE_UP',
        targetInstances,
        reason: 'High memory utilization: ' + (memoryUtilization * 100).toFixed(1) + '%',
        confidence: Math.min(1, (memoryUtilization - this.config.scaleUpThreshold) * 2),
        priority: 'HIGH'
      };
    }

    return { action: 'NONE' };
  }

  /**
   * Evaluate throughput-based scaling
   */
  evaluateThroughputScaling(metrics) {
    const currentThroughput = metrics.throughput;
    const expectedThroughput = this.calculateExpectedThroughput();
    
    if (currentThroughput < expectedThroughput * 0.5) {
      // Throughput is significantly below expected
      const targetInstances = Math.min(
        this.config.maxInstances,
        Math.ceil(this.currentInstances * (expectedThroughput / currentThroughput))
      );
      
      return {
        action: 'SCALE_UP',
        targetInstances,
        reason: 'Low throughput: ' + currentThroughput.toFixed(0) + ' vs expected ' + expectedThroughput.toFixed(0),
        confidence: 0.7,
        priority: 'MEDIUM'
      };
    }

    return { action: 'NONE' };
  }

  /**
   * Evaluate queue-based scaling
   */
  evaluateQueueScaling(metrics) {
    const queueLength = metrics.queueLength;
    const maxAcceptableQueueLength = 1000; // Configure based on requirements
    
    if (queueLength > maxAcceptableQueueLength) {
      const targetInstances = Math.min(
        this.config.maxInstances,
        Math.ceil(this.currentInstances * (queueLength / maxAcceptableQueueLength))
      );
      
      return {
        action: 'SCALE_UP',
        targetInstances,
        reason: 'High queue length: ' + queueLength,
        confidence: Math.min(1, queueLength / maxAcceptableQueueLength - 1),
        priority: 'HIGH'
      };
    }

    return { action: 'NONE' };
  }

  /**
   * Evaluate predictive scaling
   */
  async evaluatePredictiveScaling(metrics) {
    const prediction = await this.loadPredictor.predictLoad(metrics, 300000); // 5 minutes ahead
    
    if (prediction.expectedLoad > this.getCurrentCapacity() * 1.2) {
      const targetInstances = Math.min(
        this.config.maxInstances,
        Math.ceil(this.currentInstances * (prediction.expectedLoad / this.getCurrentCapacity()))
      );
      
      return {
        action: 'SCALE_UP',
        targetInstances,
        reason: 'Predicted load increase: ' + prediction.expectedLoad.toFixed(0),
        confidence: prediction.confidence,
        priority: 'MEDIUM'
      };
    }

    return { action: 'NONE' };
  }

  /**
   * Execute scaling action
   */
  async executeScalingAction(recommendation) {
    const startTime = Date.now();
    
    try {
      logger.info('Executing scaling action', {
        action: recommendation.action,
        currentInstances: this.currentInstances,
        targetInstances: recommendation.targetInstances,
        reason: recommendation.reason,
        confidence: recommendation.confidence
      });

      // Simulate scaling action (in real implementation, this would interact with cloud provider APIs)
      const scalingResult = await this.performScalingOperation(recommendation);
      
      // Update current instance count
      this.currentInstances = recommendation.targetInstances;
      
      // Record scaling action
      const scalingRecord = {
        timestamp: Date.now(),
        action: recommendation.action,
        fromInstances: scalingResult.previousInstances,
        toInstances: this.currentInstances,
        reason: recommendation.reason,
        confidence: recommendation.confidence,
        executionTime: Date.now() - startTime,
        success: scalingResult.success
      };
      
      this.scalingHistory.push(scalingRecord);
      this.lastScalingAction = scalingRecord;
      
      logger.info('Scaling action completed', {
        action: recommendation.action,
        newInstanceCount: this.currentInstances,
        executionTime: scalingRecord.executionTime + 'ms',
        success: scalingResult.success
      });

    } catch (error) {
      logger.error('Scaling action failed', {
        action: recommendation.action,
        error: error.message
      });
      
      throw error;
    }
  }

  /**
   * Perform actual scaling operation
   */
  async performScalingOperation(recommendation) {
    const previousInstances = this.currentInstances;
    
    // Simulate scaling delay
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    return {
      success: true,
      previousInstances,
      newInstances: recommendation.targetInstances,
      scalingDuration: 2000
    };
  }

  /**
   * Check if we're in cooldown period
   */
  isInCooldownPeriod() {
    if (!this.lastScalingAction) return false;
    
    const timeSinceLastScaling = Date.now() - this.lastScalingAction.timestamp;
    return timeSinceLastScaling < this.config.cooldownPeriod;
  }

  /**
   * Get action priority for sorting
   */
  getActionPriority(action) {
    const priorities = {
      'SCALE_UP': 3,
      'SCALE_DOWN': 1,
      'NONE': 0
    };
    return priorities[action] || 0;
  }

  /**
   * Calculate expected throughput based on current configuration
   */
  calculateExpectedThroughput() {
    const baselinePerInstance = 833; // transactions per minute per instance
    return this.currentInstances * baselinePerInstance;
  }

  /**
   * Get current system capacity
   */
  getCurrentCapacity() {
    return this.currentInstances * 1000; // transactions per minute
  }

  /**
   * Get current queue length (mock implementation)
   */
  getQueueLength() {
    return Math.floor(Math.random() * 500);
  }

  /**
   * Update metrics history
   */
  updateMetricsHistory(metrics) {
    this.resourceMetrics.set(metrics.timestamp, metrics);
    
    // Maintain sliding window of 24 hours
    const cutoffTime = Date.now() - 86400000;
    for (const [timestamp] of this.resourceMetrics.entries()) {
      if (timestamp < cutoffTime) {
        this.resourceMetrics.delete(timestamp);
      }
    }
  }

  /**
   * Get scaling metrics
   */
  async getScalingMetrics() {
    const recentMetrics = Array.from(this.resourceMetrics.values()).slice(-10);
    const recentScaling = this.scalingHistory.slice(-10);
    
    return {
      current: {
        instances: this.currentInstances,
        capacity: this.getCurrentCapacity(),
        expectedThroughput: this.calculateExpectedThroughput(),
        inCooldown: this.isInCooldownPeriod()
      },
      history: {
        scalingActions: recentScaling,
        resourceMetrics: recentMetrics
      },
      configuration: this.config
    };
  }

  /**
   * Stop monitoring
   */
  stop() {
    if (this.scalingTimer) {
      clearInterval(this.scalingTimer);
      this.scalingTimer = null;
    }
    
    logger.info('Auto-scaling monitoring stopped');
  }
}

/**
 * Load Predictor for predictive scaling
 */
class LoadPredictor {
  constructor() {
    this.historicalData = [];
    this.patterns = new Map();
  }

  /**
   * Predict load for future time period
   */
  async predictLoad(currentMetrics, timeAheadMs) {
    const currentHour = new Date().getHours();
    const dayOfWeek = new Date().getDay();
    
    // Get historical pattern for this time
    const patternKey = dayOfWeek + '_' + currentHour;
    const historicalPattern = this.patterns.get(patternKey);
    
    if (historicalPattern) {
      const predictedLoad = historicalPattern.averageLoad * 1.1; // 10% buffer
      return {
        expectedLoad: predictedLoad,
        confidence: historicalPattern.confidence,
        pattern: patternKey
      };
    }
    
    // Fallback to trend-based prediction
    const trend = this.calculateTrend(currentMetrics);
    return {
      expectedLoad: currentMetrics.throughput * (1 + trend),
      confidence: 0.5,
      pattern: 'trend_based'
    };
  }

  /**
   * Calculate load trend
   */
  calculateTrend(currentMetrics) {
    // Simple trend calculation
    return Math.random() * 0.2 - 0.1; // -10% to +10% change
  }
}
EOF < /dev/null