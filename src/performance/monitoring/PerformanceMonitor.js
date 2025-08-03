/**
 * Real-time Performance Monitor
 * Tracks performance metrics, alerts, and provides insights
 */

import { logger } from '../../utils/logger.js';

export class PerformanceMonitor {
  constructor(options = {}) {
    this.config = {
      enableRealTimeMetrics: options.enableRealTimeMetrics !== false,
      metricsWindow: options.metricsWindow || 300000, // 5 minutes
      alertThresholds: {
        responseTime: options.alertThresholds?.responseTime || 200, // ms
        throughput: options.alertThresholds?.throughput || 833, // transactions per minute
        errorRate: options.alertThresholds?.errorRate || 0.01, // 1%
        memoryUsage: options.alertThresholds?.memoryUsage || 0.8 // 80%
      },
      retentionPeriod: options.retentionPeriod || 86400000 // 24 hours
    };

    // Metrics storage
    this.metrics = {
      responseTime: [],
      throughput: [],
      errorRate: [],
      systemMetrics: [],
      stepMetrics: new Map(),
      customMetrics: new Map()
    };

    // Active monitoring sessions
    this.activeSessions = new Map();
    
    // Alert state
    this.activeAlerts = new Map();
    this.alertHistory = [];

    // Performance baselines
    this.baselines = {
      responseTime: null,
      throughput: null,
      errorRate: null
    };

    // Real-time monitoring
    this.monitoringInterval = null;
    if (this.config.enableRealTimeMetrics) {
      this.startRealTimeMonitoring();
    }
  }

  /**
   * Start a new monitoring session
   */
  async startSession(sessionId) {
    const session = {
      sessionId,
      startTime: Date.now(),
      metrics: {
        responseTime: [],
        throughput: [],
        errorRate: [],
        stepMetrics: new Map()
      },
      alerts: [],
      status: 'active'
    };

    this.activeSessions.set(sessionId, session);

    logger.info('Performance monitoring session started', {
      sessionId,
      alertThresholds: this.config.alertThresholds
    });

    return session;
  }

  /**
   * Record step-specific metrics
   */
  async recordStepMetrics(stepName, metrics) {
    const timestamp = Date.now();
    
    const stepMetric = {
      stepName,
      timestamp,
      duration: metrics.duration,
      itemCount: metrics.itemCount,
      success: !metrics.error,
      ...metrics
    };

    // Store in global metrics
    if (!this.metrics.stepMetrics.has(stepName)) {
      this.metrics.stepMetrics.set(stepName, []);
    }
    this.metrics.stepMetrics.get(stepName).push(stepMetric);

    // Store in active sessions
    for (const session of this.activeSessions.values()) {
      if (!session.metrics.stepMetrics.has(stepName)) {
        session.metrics.stepMetrics.set(stepName, []);
      }
      session.metrics.stepMetrics.get(stepName).push(stepMetric);
    }

    // Check for alerts
    await this.checkStepAlerts(stepName, stepMetric);

    // Maintain data retention
    this.cleanupOldMetrics();

    logger.debug('Step metrics recorded', {
      stepName,
      duration: metrics.duration?.toFixed(2) + 'ms',
      itemCount: metrics.itemCount
    });
  }

  /**
   * Record system performance metrics
   */
  async recordSystemMetrics(systemMetrics) {
    const timestamp = Date.now();
    
    const metric = {
      timestamp,
      cpuUsage: systemMetrics.cpuUsage || this.getCurrentCPUUsage(),
      memoryUsage: systemMetrics.memoryUsage || this.getCurrentMemoryUsage(),
      diskUsage: systemMetrics.diskUsage || 0.5,
      networkLatency: systemMetrics.networkLatency || 50,
      activeConnections: systemMetrics.activeConnections || 0
    };

    this.metrics.systemMetrics.push(metric);

    // Check system alerts
    await this.checkSystemAlerts(metric);

    logger.debug('System metrics recorded', {
      cpuUsage: (metric.cpuUsage * 100).toFixed(1) + '%',
      memoryUsage: (metric.memoryUsage * 100).toFixed(1) + '%'
    });
  }

  /**
   * Record transaction throughput
   */
  async recordThroughput(transactionCount, timeWindow) {
    const timestamp = Date.now();
    const throughputValue = transactionCount / (timeWindow / 60000); // per minute

    const throughputMetric = {
      timestamp,
      value: throughputValue,
      transactionCount,
      timeWindow
    };

    this.metrics.throughput.push(throughputMetric);

    // Check throughput alerts
    if (throughputValue < this.config.alertThresholds.throughput) {
      await this.triggerAlert('LOW_THROUGHPUT', {
        current: throughputValue,
        threshold: this.config.alertThresholds.throughput,
        severity: 'WARNING'
      });
    }

    logger.debug('Throughput recorded', {
      throughput: throughputValue.toFixed(2) + ' tx/min',
      transactionCount
    });
  }

  /**
   * Record response time metrics
   */
  async recordResponseTime(responseTime, operation = 'unknown') {
    const timestamp = Date.now();

    const responseMetric = {
      timestamp,
      value: responseTime,
      operation
    };

    this.metrics.responseTime.push(responseMetric);

    // Check response time alerts
    if (responseTime > this.config.alertThresholds.responseTime) {
      await this.triggerAlert('HIGH_RESPONSE_TIME', {
        current: responseTime,
        threshold: this.config.alertThresholds.responseTime,
        operation,
        severity: responseTime > this.config.alertThresholds.responseTime * 2 ? 'CRITICAL' : 'WARNING'
      });
    }

    logger.debug('Response time recorded', {
      responseTime: responseTime.toFixed(2) + 'ms',
      operation
    });
  }

  /**
   * Record error rate
   */
  async recordErrorRate(errorCount, totalCount) {
    const timestamp = Date.now();
    const errorRate = totalCount > 0 ? errorCount / totalCount : 0;

    const errorMetric = {
      timestamp,
      value: errorRate,
      errorCount,
      totalCount
    };

    this.metrics.errorRate.push(errorMetric);

    // Check error rate alerts
    if (errorRate > this.config.alertThresholds.errorRate) {
      await this.triggerAlert('HIGH_ERROR_RATE', {
        current: errorRate,
        threshold: this.config.alertThresholds.errorRate,
        errorCount,
        totalCount,
        severity: errorRate > this.config.alertThresholds.errorRate * 2 ? 'CRITICAL' : 'WARNING'
      });
    }

    logger.debug('Error rate recorded', {
      errorRate: (errorRate * 100).toFixed(2) + '%',
      errorCount,
      totalCount
    });
  }

  /**
   * Update progress for long-running operations
   */
  updateProgress(operationId, processed, total) {
    const progressPercent = total > 0 ? (processed / total) * 100 : 0;
    
    // Update session progress if exists
    for (const session of this.activeSessions.values()) {
      if (session.sessionId === operationId) {
        session.progress = {
          processed,
          total,
          percent: progressPercent,
          lastUpdate: Date.now()
        };
        break;
      }
    }

    logger.debug('Progress updated', {
      operationId,
      progress: progressPercent.toFixed(1) + '%',
      processed,
      total
    });
  }

  /**
   * Check for step-specific alerts
   */
  async checkStepAlerts(stepName, metric) {
    // Check step duration
    if (metric.duration > this.config.alertThresholds.responseTime * 10) {
      await this.triggerAlert('SLOW_STEP_EXECUTION', {
        stepName,
        duration: metric.duration,
        threshold: this.config.alertThresholds.responseTime * 10,
        severity: 'WARNING'
      });
    }

    // Check step failure
    if (!metric.success) {
      await this.triggerAlert('STEP_FAILURE', {
        stepName,
        error: metric.error,
        severity: 'CRITICAL'
      });
    }
  }

  /**
   * Check for system-level alerts
   */
  async checkSystemAlerts(metric) {
    // Memory usage alert
    if (metric.memoryUsage > this.config.alertThresholds.memoryUsage) {
      await this.triggerAlert('HIGH_MEMORY_USAGE', {
        current: metric.memoryUsage,
        threshold: this.config.alertThresholds.memoryUsage,
        severity: metric.memoryUsage > 0.9 ? 'CRITICAL' : 'WARNING'
      });
    }

    // CPU usage alert
    if (metric.cpuUsage > 0.8) {
      await this.triggerAlert('HIGH_CPU_USAGE', {
        current: metric.cpuUsage,
        threshold: 0.8,
        severity: metric.cpuUsage > 0.9 ? 'CRITICAL' : 'WARNING'
      });
    }
  }

  /**
   * Trigger an alert
   */
  async triggerAlert(alertType, details) {
    const alert = {
      id: this.generateAlertId(),
      type: alertType,
      severity: details.severity || 'WARNING',
      timestamp: Date.now(),
      details,
      acknowledged: false,
      resolved: false
    };

    // Check if similar alert is already active
    const existingAlert = Array.from(this.activeAlerts.values())
      .find(a => a.type === alertType && !a.resolved);

    if (existingAlert) {
      // Update existing alert
      existingAlert.count = (existingAlert.count || 1) + 1;
      existingAlert.lastOccurrence = Date.now();
      existingAlert.details = details;
    } else {
      // Create new alert
      this.activeAlerts.set(alert.id, alert);
      this.alertHistory.push(alert);

      logger.warn('Performance alert triggered', {
        alertId: alert.id,
        type: alertType,
        severity: alert.severity,
        details
      });
    }

    return alert;
  }

  /**
   * Get current performance snapshot
   */
  async getPerformanceSnapshot() {
    const now = Date.now();
    const windowStart = now - this.config.metricsWindow;

    return {
      timestamp: now,
      responseTime: this.calculateAggregateMetric(this.metrics.responseTime, windowStart),
      throughput: this.calculateAggregateMetric(this.metrics.throughput, windowStart),
      errorRate: this.calculateAggregateMetric(this.metrics.errorRate, windowStart),
      systemMetrics: this.getLatestSystemMetrics(),
      stepMetrics: this.getStepMetricsSummary(windowStart),
      activeAlerts: Array.from(this.activeAlerts.values()).filter(a => !a.resolved),
      activeSessions: this.activeSessions.size
    };
  }

  /**
   * Calculate aggregate metric for time window
   */
  calculateAggregateMetric(metricArray, windowStart) {
    const windowMetrics = metricArray.filter(m => m.timestamp >= windowStart);
    
    if (windowMetrics.length === 0) {
      return { count: 0, avg: 0, min: 0, max: 0, p95: 0 };
    }

    const values = windowMetrics.map(m => m.value).sort((a, b) => a - b);
    const count = values.length;
    const sum = values.reduce((acc, val) => acc + val, 0);
    const avg = sum / count;
    const min = values[0];
    const max = values[count - 1];
    const p95Index = Math.floor(count * 0.95);
    const p95 = values[p95Index] || max;

    return { count, avg, min, max, p95 };
  }

  /**
   * Get latest system metrics
   */
  getLatestSystemMetrics() {
    const latest = this.metrics.systemMetrics[this.metrics.systemMetrics.length - 1];
    return latest || {
      cpuUsage: 0,
      memoryUsage: 0,
      diskUsage: 0,
      networkLatency: 0,
      activeConnections: 0
    };
  }

  /**
   * Get step metrics summary
   */
  getStepMetricsSummary(windowStart) {
    const summary = {};

    for (const [stepName, metrics] of this.metrics.stepMetrics.entries()) {
      const windowMetrics = metrics.filter(m => m.timestamp >= windowStart);
      
      if (windowMetrics.length > 0) {
        const durations = windowMetrics.map(m => m.duration);
        const successCount = windowMetrics.filter(m => m.success).length;
        
        summary[stepName] = {
          count: windowMetrics.length,
          successRate: successCount / windowMetrics.length,
          avgDuration: durations.reduce((sum, d) => sum + d, 0) / durations.length,
          minDuration: Math.min(...durations),
          maxDuration: Math.max(...durations)
        };
      }
    }

    return summary;
  }

  /**
   * Start real-time monitoring
   */
  startRealTimeMonitoring() {
    this.monitoringInterval = setInterval(async () => {
      await this.collectRealTimeMetrics();
    }, 10000); // Every 10 seconds

    logger.info('Real-time performance monitoring started');
  }

  /**
   * Collect real-time system metrics
   */
  async collectRealTimeMetrics() {
    try {
      const systemMetrics = {
        cpuUsage: this.getCurrentCPUUsage(),
        memoryUsage: this.getCurrentMemoryUsage(),
        timestamp: Date.now()
      };

      await this.recordSystemMetrics(systemMetrics);

    } catch (error) {
      logger.warn('Failed to collect real-time metrics', { error: error.message });
    }
  }

  /**
   * Clean up old metrics data
   */
  cleanupOldMetrics() {
    const cutoffTime = Date.now() - this.config.retentionPeriod;

    // Clean up each metric array
    this.metrics.responseTime = this.metrics.responseTime.filter(m => m.timestamp > cutoffTime);
    this.metrics.throughput = this.metrics.throughput.filter(m => m.timestamp > cutoffTime);
    this.metrics.errorRate = this.metrics.errorRate.filter(m => m.timestamp > cutoffTime);
    this.metrics.systemMetrics = this.metrics.systemMetrics.filter(m => m.timestamp > cutoffTime);

    // Clean up step metrics
    for (const [stepName, metrics] of this.metrics.stepMetrics.entries()) {
      const filtered = metrics.filter(m => m.timestamp > cutoffTime);
      if (filtered.length > 0) {
        this.metrics.stepMetrics.set(stepName, filtered);
      } else {
        this.metrics.stepMetrics.delete(stepName);
      }
    }

    // Clean up old alerts
    this.alertHistory = this.alertHistory.filter(a => a.timestamp > cutoffTime);
  }

  /**
   * Get performance metrics for reporting
   */
  async getMetrics() {
    const snapshot = await this.getPerformanceSnapshot();
    
    return {
      current: snapshot,
      alerts: {
        active: Array.from(this.activeAlerts.values()).filter(a => !a.resolved),
        total: this.alertHistory.length,
        byType: this.getAlertsByType()
      },
      sessions: {
        active: this.activeSessions.size,
        sessions: Array.from(this.activeSessions.values()).map(s => ({
          sessionId: s.sessionId,
          startTime: s.startTime,
          duration: Date.now() - s.startTime,
          status: s.status,
          progress: s.progress
        }))
      },
      configuration: this.config
    };
  }

  /**
   * Get alerts grouped by type
   */
  getAlertsByType() {
    const byType = {};
    
    for (const alert of this.alertHistory) {
      if (!byType[alert.type]) {
        byType[alert.type] = { count: 0, severity: {} };
      }
      
      byType[alert.type].count++;
      
      if (!byType[alert.type].severity[alert.severity]) {
        byType[alert.type].severity[alert.severity] = 0;
      }
      byType[alert.type].severity[alert.severity]++;
    }
    
    return byType;
  }

  /**
   * Utility methods
   */
  generateAlertId() {
    return 'alert_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }

  getCurrentCPUUsage() {
    // Simulate CPU usage
    return 0.3 + Math.random() * 0.4;
  }

  getCurrentMemoryUsage() {
    // Simulate memory usage
    return 0.4 + Math.random() * 0.3;
  }

  /**
   * Stop monitoring and cleanup
   */
  async stop() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }

    logger.info('Performance monitoring stopped');
  }
}
EOF < /dev/null