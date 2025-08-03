/**
 * Comprehensive Monitoring and Alerting System for Cash Clearing Workflow
 * Provides real-time dashboards, alert management, pattern detection, and performance monitoring
 */

import { logger } from './logger.js';
import { errorClassifier } from './errorClassification.js';
import { EventEmitter } from 'events';

/**
 * Alert severity levels
 */
export const ALERT_SEVERITY = {
  CRITICAL: { level: 1, color: '#FF4444', escalation: 'IMMEDIATE' },
  HIGH: { level: 2, color: '#FF8800', escalation: 'URGENT' },
  MEDIUM: { level: 3, color: '#FFBB00', escalation: 'NORMAL' },
  LOW: { level: 4, color: '#44AA44', escalation: 'INFO' },
  INFO: { level: 5, color: '#4488FF', escalation: 'NONE' }
};

/**
 * Alert types
 */
export const ALERT_TYPES = {
  ERROR_RATE_THRESHOLD: 'error_rate_threshold',
  PERFORMANCE_DEGRADATION: 'performance_degradation',
  RESOURCE_EXHAUSTION: 'resource_exhaustion',
  WORKFLOW_FAILURE: 'workflow_failure',
  DATA_QUALITY_ISSUE: 'data_quality_issue',
  SLA_BREACH: 'sla_breach',
  SECURITY_INCIDENT: 'security_incident',
  CIRCUIT_BREAKER_OPEN: 'circuit_breaker_open',
  BATCH_SIZE_ANOMALY: 'batch_size_anomaly',
  APPROVAL_QUEUE_BACKLOG: 'approval_queue_backlog'
};

/**
 * Metric types for monitoring
 */
export const METRIC_TYPES = {
  COUNTER: 'counter',
  GAUGE: 'gauge',
  HISTOGRAM: 'histogram',
  TIMER: 'timer'
};

/**
 * Dashboard configurations
 */
export const DASHBOARD_CONFIGS = {
  REAL_TIME_OVERVIEW: {
    refreshInterval: 5000,
    timeWindow: 3600000, // 1 hour
    metrics: ['throughput', 'error_rate', 'active_workflows', 'pending_approvals']
  },
  PERFORMANCE_ANALYSIS: {
    refreshInterval: 30000,
    timeWindow: 86400000, // 24 hours
    metrics: ['avg_processing_time', 'batch_efficiency', 'resource_utilization']
  },
  ERROR_ANALYSIS: {
    refreshInterval: 10000,
    timeWindow: 7200000, // 2 hours
    metrics: ['error_patterns', 'recovery_success_rate', 'escalation_rate']
  }
};

/**
 * Comprehensive monitoring system
 */
export class MonitoringSystem extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.config = {
      enableRealTimeMonitoring: options.enableRealTimeMonitoring !== false,
      enableAlerting: options.enableAlerting !== false,
      enablePatternDetection: options.enablePatternDetection !== false,
      alertThresholds: {
        errorRate: options.errorRateThreshold || 0.05, // 5%
        performanceDegradation: options.performanceDegradation || 0.3, // 30% slower
        resourceUtilization: options.resourceUtilization || 0.85, // 85%
        slaBreachThreshold: options.slaBreachThreshold || 0.95 // 95% of SLA time
      },
      retentionPeriod: options.retentionPeriod || 2592000000, // 30 days
      alertCooldownPeriod: options.alertCooldownPeriod || 300000, // 5 minutes
      patternDetectionWindow: options.patternDetectionWindow || 3600000 // 1 hour
    };

    // State management
    this.metrics = new Map();
    this.alerts = new Map();
    this.dashboards = new Map();
    this.patterns = new Map();
    this.subscribers = new Map();
    
    // Alert management
    this.activeAlerts = new Map();
    this.alertHistory = [];
    this.alertCooldowns = new Map();
    
    // Performance tracking
    this.performanceBaselines = new Map();
    this.anomalyDetector = new AnomalyDetector();
    
    // Pattern detection
    this.patternDetector = new PatternDetector();
    
    // Initialize monitoring
    this.initializeMonitoring();
  }

  /**
   * Initialize monitoring system
   */
  initializeMonitoring() {
    // Initialize metric collectors
    this.initializeMetricCollectors();
    
    // Initialize dashboards
    this.initializeDashboards();
    
    // Start background processes
    if (this.config.enableRealTimeMonitoring) {
      this.startRealTimeMonitoring();
    }
    
    if (this.config.enablePatternDetection) {
      this.startPatternDetection();
    }
    
    // Start cleanup processes
    this.startCleanupProcess();
    
    logger.info('Monitoring system initialized', {
      realTimeMonitoring: this.config.enableRealTimeMonitoring,
      alerting: this.config.enableAlerting,
      patternDetection: this.config.enablePatternDetection
    });
  }

  /**
   * Initialize metric collectors
   */
  initializeMetricCollectors() {
    const metricDefinitions = [
      { name: 'workflow_throughput', type: METRIC_TYPES.GAUGE, unit: 'workflows/min' },
      { name: 'transaction_throughput', type: METRIC_TYPES.GAUGE, unit: 'transactions/min' },
      { name: 'error_rate', type: METRIC_TYPES.GAUGE, unit: 'percentage' },
      { name: 'avg_processing_time', type: METRIC_TYPES.HISTOGRAM, unit: 'milliseconds' },
      { name: 'active_workflows', type: METRIC_TYPES.GAUGE, unit: 'count' },
      { name: 'pending_approvals', type: METRIC_TYPES.GAUGE, unit: 'count' },
      { name: 'circuit_breaker_state', type: METRIC_TYPES.GAUGE, unit: 'state' },
      { name: 'resource_utilization', type: METRIC_TYPES.GAUGE, unit: 'percentage' },
      { name: 'data_quality_score', type: METRIC_TYPES.GAUGE, unit: 'score' },
      { name: 'sla_compliance', type: METRIC_TYPES.GAUGE, unit: 'percentage' }
    ];

    for (const metric of metricDefinitions) {
      this.metrics.set(metric.name, {
        ...metric,
        values: [],
        lastUpdated: null,
        baseline: null
      });
    }
  }

  /**
   * Initialize dashboard configurations
   */
  initializeDashboards() {
    for (const [name, config] of Object.entries(DASHBOARD_CONFIGS)) {
      this.dashboards.set(name, {
        ...config,
        data: new Map(),
        lastUpdate: null,
        subscribers: new Set()
      });
    }
  }

  /**
   * Record a metric value
   */
  recordMetric(metricName, value, timestamp = null, tags = {}) {
    if (!this.metrics.has(metricName)) {
      logger.warn('Unknown metric', { metricName });
      return;
    }

    const metric = this.metrics.get(metricName);
    const dataPoint = {
      value,
      timestamp: timestamp || Date.now(),
      tags
    };

    metric.values.push(dataPoint);
    metric.lastUpdated = dataPoint.timestamp;

    // Maintain retention period
    this.cleanupMetricData(metric);

    // Check for alerts
    if (this.config.enableAlerting) {
      this.checkMetricAlerts(metricName, value, dataPoint);
    }

    // Emit metric update event
    this.emit('metric:updated', { metricName, value, timestamp: dataPoint.timestamp, tags });

    // Update affected dashboards
    this.updateDashboards(metricName, dataPoint);
  }

  /**
   * Get current metric value
   */
  getMetric(metricName, timeWindow = null) {
    if (!this.metrics.has(metricName)) {
      return null;
    }

    const metric = this.metrics.get(metricName);
    let values = metric.values;

    if (timeWindow) {
      const cutoffTime = Date.now() - timeWindow;
      values = values.filter(v => v.timestamp >= cutoffTime);
    }

    if (values.length === 0) {
      return null;
    }

    // Return different aggregations based on metric type
    switch (metric.type) {
      case METRIC_TYPES.GAUGE:
        return values[values.length - 1]; // Latest value
      
      case METRIC_TYPES.COUNTER:
        return { value: values.reduce((sum, v) => sum + v.value, 0) };
      
      case METRIC_TYPES.HISTOGRAM:
        return this.calculateHistogramStats(values);
      
      case METRIC_TYPES.TIMER:
        return this.calculateTimerStats(values);
      
      default:
        return values[values.length - 1];
    }
  }

  /**
   * Calculate histogram statistics
   */
  calculateHistogramStats(values) {
    const sortedValues = values.map(v => v.value).sort((a, b) => a - b);
    const len = sortedValues.length;

    return {
      count: len,
      min: sortedValues[0],
      max: sortedValues[len - 1],
      mean: sortedValues.reduce((sum, v) => sum + v, 0) / len,
      median: len % 2 === 0 ? 
        (sortedValues[len / 2 - 1] + sortedValues[len / 2]) / 2 : 
        sortedValues[Math.floor(len / 2)],
      p95: sortedValues[Math.floor(len * 0.95)],
      p99: sortedValues[Math.floor(len * 0.99)]
    };
  }

  /**
   * Calculate timer statistics
   */
  calculateTimerStats(values) {
    return this.calculateHistogramStats(values);
  }

  /**
   * Alert management
   */
  checkMetricAlerts(metricName, value, dataPoint) {
    const alertRules = this.getAlertRulesForMetric(metricName);
    
    for (const rule of alertRules) {
      if (this.evaluateAlertRule(rule, value, dataPoint)) {
        this.triggerAlert(rule, metricName, value, dataPoint);
      }
    }
  }

  /**
   * Get alert rules for a specific metric
   */
  getAlertRulesForMetric(metricName) {
    const rules = [];

    switch (metricName) {
      case 'error_rate':
        rules.push({
          type: ALERT_TYPES.ERROR_RATE_THRESHOLD,
          condition: 'greater_than',
          threshold: this.config.alertThresholds.errorRate,
          severity: ALERT_SEVERITY.HIGH,
          message: `Error rate exceeded threshold: {value}%`
        });
        break;

      case 'avg_processing_time':
        rules.push({
          type: ALERT_TYPES.PERFORMANCE_DEGRADATION,
          condition: 'percentage_increase',
          threshold: this.config.alertThresholds.performanceDegradation,
          severity: ALERT_SEVERITY.MEDIUM,
          message: `Processing time degraded by {percentage}%`
        });
        break;

      case 'resource_utilization':
        rules.push({
          type: ALERT_TYPES.RESOURCE_EXHAUSTION,
          condition: 'greater_than',
          threshold: this.config.alertThresholds.resourceUtilization,
          severity: ALERT_SEVERITY.HIGH,
          message: `Resource utilization high: {value}%`
        });
        break;

      case 'pending_approvals':
        rules.push({
          type: ALERT_TYPES.APPROVAL_QUEUE_BACKLOG,
          condition: 'greater_than',
          threshold: 100,
          severity: ALERT_SEVERITY.MEDIUM,
          message: `Approval queue backlog: {value} pending approvals`
        });
        break;
    }

    return rules;
  }

  /**
   * Evaluate alert rule against metric value
   */
  evaluateAlertRule(rule, value, dataPoint) {
    switch (rule.condition) {
      case 'greater_than':
        return value > rule.threshold;
      
      case 'less_than':
        return value < rule.threshold;
      
      case 'percentage_increase':
        const baseline = this.getBaseline(dataPoint.metricName);
        if (!baseline) return false;
        const increase = (value - baseline) / baseline;
        return increase > rule.threshold;
      
      case 'anomaly':
        return this.anomalyDetector.isAnomalous(value, dataPoint);
      
      default:
        return false;
    }
  }

  /**
   * Trigger an alert
   */
  triggerAlert(rule, metricName, value, dataPoint) {
    const alertId = this.generateAlertId();
    const alertKey = `${rule.type}_${metricName}`;
    
    // Check cooldown period
    if (this.isInCooldown(alertKey)) {
      return;
    }

    const alert = {
      id: alertId,
      type: rule.type,
      severity: rule.severity,
      metric: metricName,
      value,
      threshold: rule.threshold,
      message: this.formatAlertMessage(rule.message, { value, threshold: rule.threshold }),
      timestamp: dataPoint.timestamp,
      tags: dataPoint.tags,
      status: 'ACTIVE',
      acknowledgedBy: null,
      acknowledgedAt: null,
      resolvedAt: null
    };

    // Store alert
    this.activeAlerts.set(alertId, alert);
    this.alertHistory.push(alert);
    
    // Set cooldown
    this.alertCooldowns.set(alertKey, Date.now() + this.config.alertCooldownPeriod);

    // Emit alert event
    this.emit('alert:triggered', alert);

    // Send notifications
    this.sendAlertNotifications(alert);

    logger.warn('Alert triggered', {
      alertId,
      type: rule.type,
      severity: rule.severity.level,
      metric: metricName,
      value,
      message: alert.message
    });
  }

  /**
   * Send alert notifications
   */
  sendAlertNotifications(alert) {
    // In a real implementation, this would integrate with:
    // - Email notifications
    // - Slack/Teams webhooks
    // - PagerDuty/OpsGenie
    // - SMS alerts
    
    const notification = {
      alert,
      channels: this.getNotificationChannels(alert.severity),
      timestamp: Date.now()
    };

    this.emit('notification:sent', notification);
  }

  /**
   * Get notification channels based on severity
   */
  getNotificationChannels(severity) {
    const channels = [];
    
    switch (severity.level) {
      case 1: // CRITICAL
        channels.push('pagerduty', 'sms', 'email', 'slack');
        break;
      case 2: // HIGH
        channels.push('email', 'slack');
        break;
      case 3: // MEDIUM
        channels.push('slack');
        break;
      default:
        channels.push('log');
    }
    
    return channels;
  }

  /**
   * Acknowledge an alert
   */
  acknowledgeAlert(alertId, acknowledgedBy, reason = null) {
    if (!this.activeAlerts.has(alertId)) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    const alert = this.activeAlerts.get(alertId);
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = Date.now();
    alert.acknowledgmentReason = reason;

    this.emit('alert:acknowledged', alert);

    logger.info('Alert acknowledged', {
      alertId,
      acknowledgedBy,
      reason
    });
  }

  /**
   * Resolve an alert
   */
  resolveAlert(alertId, resolvedBy, resolution = null) {
    if (!this.activeAlerts.has(alertId)) {
      throw new Error(`Alert not found: ${alertId}`);
    }

    const alert = this.activeAlerts.get(alertId);
    alert.status = 'RESOLVED';
    alert.resolvedBy = resolvedBy;
    alert.resolvedAt = Date.now();
    alert.resolution = resolution;

    this.activeAlerts.delete(alertId);
    this.emit('alert:resolved', alert);

    logger.info('Alert resolved', {
      alertId,
      resolvedBy,
      resolution
    });
  }

  /**
   * Dashboard management
   */
  getDashboardData(dashboardName, timeWindow = null) {
    if (!this.dashboards.has(dashboardName)) {
      throw new Error(`Dashboard not found: ${dashboardName}`);
    }

    const dashboard = this.dashboards.get(dashboardName);
    const config = DASHBOARD_CONFIGS[dashboardName];
    const effectiveTimeWindow = timeWindow || config.timeWindow;

    const data = {
      name: dashboardName,
      lastUpdate: dashboard.lastUpdate,
      timeWindow: effectiveTimeWindow,
      metrics: {}
    };

    // Collect data for all metrics in this dashboard
    for (const metricName of config.metrics) {
      const metricData = this.getMetric(metricName, effectiveTimeWindow);
      if (metricData) {
        data.metrics[metricName] = metricData;
      }
    }

    // Add derived metrics
    data.derived = this.calculateDerivedMetrics(data.metrics, effectiveTimeWindow);

    // Add alerts for this timeframe
    data.alerts = this.getActiveAlertsForDashboard(dashboardName);

    return data;
  }

  /**
   * Calculate derived metrics for dashboard
   */
  calculateDerivedMetrics(metrics, timeWindow) {
    const derived = {};

    // Calculate SLA compliance
    if (metrics.avg_processing_time && metrics.error_rate) {
      const processingTimeCompliance = metrics.avg_processing_time.mean < 300000 ? 1 : 0; // 5 minutes SLA
      const errorRateCompliance = metrics.error_rate.value < 0.05 ? 1 : 0; // 5% error rate SLA
      derived.sla_compliance = (processingTimeCompliance + errorRateCompliance) / 2;
    }

    // Calculate efficiency score
    if (metrics.workflow_throughput && metrics.error_rate) {
      const throughputScore = Math.min(metrics.workflow_throughput.value / 10, 1); // Normalize to 10 workflows/min
      const errorScore = 1 - metrics.error_rate.value;
      derived.efficiency_score = (throughputScore + errorScore) / 2;
    }

    return derived;
  }

  /**
   * Get active alerts for dashboard
   */
  getActiveAlertsForDashboard(dashboardName) {
    return Array.from(this.activeAlerts.values())
      .filter(alert => alert.status === 'ACTIVE')
      .sort((a, b) => a.severity.level - b.severity.level);
  }

  /**
   * Pattern detection
   */
  startPatternDetection() {
    setInterval(() => {
      this.detectPatterns();
    }, this.config.patternDetectionWindow);
  }

  detectPatterns() {
    try {
      // Detect error patterns
      this.detectErrorPatterns();
      
      // Detect performance patterns
      this.detectPerformancePatterns();
      
      // Detect anomalies
      this.detectAnomalies();
      
      // Detect trends
      this.detectTrends();
    } catch (error) {
      logger.error('Pattern detection failed', { error: error.message });
    }
  }

  detectErrorPatterns() {
    const errorTrends = errorClassifier.getErrorTrends(this.config.patternDetectionWindow);
    
    // Look for significant error pattern changes
    if (errorTrends.totalErrors > 50) { // Threshold for pattern analysis
      const pattern = {
        type: 'ERROR_SPIKE',
        detected: Date.now(),
        details: errorTrends,
        severity: errorTrends.totalErrors > 100 ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.MEDIUM
      };
      
      this.patterns.set(`error_pattern_${Date.now()}`, pattern);
      this.emit('pattern:detected', pattern);
    }
  }

  detectPerformancePatterns() {
    const processingTimeMetric = this.getMetric('avg_processing_time', this.config.patternDetectionWindow);
    
    if (processingTimeMetric && processingTimeMetric.count > 10) {
      const trend = this.calculateTrend(processingTimeMetric);
      
      if (Math.abs(trend) > 0.2) { // 20% change
        const pattern = {
          type: trend > 0 ? 'PERFORMANCE_DEGRADATION' : 'PERFORMANCE_IMPROVEMENT',
          detected: Date.now(),
          trend,
          details: processingTimeMetric,
          severity: trend > 0.3 ? ALERT_SEVERITY.HIGH : ALERT_SEVERITY.MEDIUM
        };
        
        this.patterns.set(`perf_pattern_${Date.now()}`, pattern);
        this.emit('pattern:detected', pattern);
      }
    }
  }

  detectAnomalies() {
    // Use statistical methods to detect anomalies
    for (const [metricName, metric] of this.metrics.entries()) {
      if (metric.values.length > 20) { // Need sufficient data
        const anomalies = this.anomalyDetector.detectAnomalies(metric.values);
        
        if (anomalies.length > 0) {
          const pattern = {
            type: 'ANOMALY_DETECTED',
            detected: Date.now(),
            metric: metricName,
            anomalies,
            severity: ALERT_SEVERITY.MEDIUM
          };
          
          this.patterns.set(`anomaly_${metricName}_${Date.now()}`, pattern);
          this.emit('pattern:detected', pattern);
        }
      }
    }
  }

  detectTrends() {
    // Implement trend detection for key metrics
    const keyMetrics = ['workflow_throughput', 'error_rate', 'avg_processing_time'];
    
    for (const metricName of keyMetrics) {
      const metric = this.getMetric(metricName, this.config.patternDetectionWindow * 2); // Longer window for trends
      
      if (metric && metric.count > 50) {
        const trend = this.calculateLongTermTrend(metric);
        
        if (Math.abs(trend.slope) > trend.significance) {
          const pattern = {
            type: 'TREND_DETECTED',
            detected: Date.now(),
            metric: metricName,
            trend,
            severity: ALERT_SEVERITY.LOW
          };
          
          this.patterns.set(`trend_${metricName}_${Date.now()}`, pattern);
          this.emit('pattern:detected', pattern);
        }
      }
    }
  }

  /**
   * Real-time monitoring
   */
  startRealTimeMonitoring() {
    setInterval(() => {
      this.updateRealTimeMetrics();
    }, 5000); // Update every 5 seconds
  }

  async updateRealTimeMetrics() {
    try {
      // Update system metrics
      await this.updateSystemMetrics();
      
      // Update workflow metrics
      await this.updateWorkflowMetrics();
      
      // Update dashboard data
      this.updateAllDashboards();
    } catch (error) {
      logger.error('Real-time metrics update failed', { error: error.message });
    }
  }

  async updateSystemMetrics() {
    // In a real implementation, these would connect to actual system monitoring
    this.recordMetric('resource_utilization', Math.random() * 100);
    this.recordMetric('active_workflows', Math.floor(Math.random() * 10));
  }

  async updateWorkflowMetrics() {
    // In a real implementation, these would query the database
    this.recordMetric('pending_approvals', Math.floor(Math.random() * 50));
    this.recordMetric('error_rate', Math.random() * 0.1);
  }

  /**
   * Utility methods
   */
  updateDashboards(metricName, dataPoint) {
    for (const [name, dashboard] of this.dashboards.entries()) {
      const config = DASHBOARD_CONFIGS[name];
      if (config.metrics.includes(metricName)) {
        dashboard.lastUpdate = Date.now();
        this.emit('dashboard:updated', { name, metricName, dataPoint });
      }
    }
  }

  updateAllDashboards() {
    for (const dashboardName of this.dashboards.keys()) {
      const data = this.getDashboardData(dashboardName);
      this.emit('dashboard:refresh', { name: dashboardName, data });
    }
  }

  cleanupMetricData(metric) {
    const cutoffTime = Date.now() - this.config.retentionPeriod;
    metric.values = metric.values.filter(v => v.timestamp >= cutoffTime);
  }

  startCleanupProcess() {
    setInterval(() => {
      this.performCleanup();
    }, 3600000); // Every hour
  }

  performCleanup() {
    // Clean up old metric data
    for (const metric of this.metrics.values()) {
      this.cleanupMetricData(metric);
    }

    // Clean up old alerts
    const alertCutoff = Date.now() - this.config.retentionPeriod;
    this.alertHistory = this.alertHistory.filter(a => a.timestamp >= alertCutoff);

    // Clean up expired cooldowns
    for (const [key, expiry] of this.alertCooldowns.entries()) {
      if (Date.now() > expiry) {
        this.alertCooldowns.delete(key);
      }
    }

    logger.debug('Monitoring system cleanup completed');
  }

  isInCooldown(alertKey) {
    return this.alertCooldowns.has(alertKey) && 
           Date.now() < this.alertCooldowns.get(alertKey);
  }

  formatAlertMessage(template, variables) {
    let message = template;
    for (const [key, value] of Object.entries(variables)) {
      message = message.replace(`{${key}}`, value);
    }
    return message;
  }

  generateAlertId() {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  calculateTrend(metricData) {
    // Simple linear regression to calculate trend
    const values = metricData.values || [];
    if (values.length < 2) return 0;

    const n = values.length;
    const sumX = values.reduce((sum, _, i) => sum + i, 0);
    const sumY = values.reduce((sum, v) => sum + v.value, 0);
    const sumXY = values.reduce((sum, v, i) => sum + i * v.value, 0);
    const sumXX = values.reduce((sum, _, i) => sum + i * i, 0);

    const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
    return slope;
  }

  calculateLongTermTrend(metricData) {
    const slope = this.calculateTrend(metricData);
    const values = metricData.values.map(v => v.value);
    const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
    const significance = Math.abs(slope) / mean; // Relative significance

    return { slope, significance };
  }

  getBaseline(metricName) {
    const metric = this.metrics.get(metricName);
    return metric?.baseline;
  }

  /**
   * Public API methods
   */
  getSystemHealth() {
    const health = {
      timestamp: Date.now(),
      overall: 'HEALTHY',
      components: {},
      metrics: {},
      alerts: {
        active: this.activeAlerts.size,
        critical: 0,
        high: 0,
        medium: 0,
        low: 0
      }
    };

    // Calculate alert counts by severity
    for (const alert of this.activeAlerts.values()) {
      switch (alert.severity.level) {
        case 1: health.alerts.critical++; break;
        case 2: health.alerts.high++; break;
        case 3: health.alerts.medium++; break;
        case 4: health.alerts.low++; break;
      }
    }

    // Determine overall health
    if (health.alerts.critical > 0) {
      health.overall = 'CRITICAL';
    } else if (health.alerts.high > 0) {
      health.overall = 'DEGRADED';
    } else if (health.alerts.medium > 2) {
      health.overall = 'WARNING';
    }

    // Add key metrics
    health.metrics = {
      error_rate: this.getMetric('error_rate')?.value || 0,
      avg_processing_time: this.getMetric('avg_processing_time')?.mean || 0,
      active_workflows: this.getMetric('active_workflows')?.value || 0,
      resource_utilization: this.getMetric('resource_utilization')?.value || 0
    };

    return health;
  }

  getMetricHistory(metricName, timeWindow = 3600000) {
    const metric = this.metrics.get(metricName);
    if (!metric) return null;

    const cutoffTime = Date.now() - timeWindow;
    return metric.values.filter(v => v.timestamp >= cutoffTime);
  }

  getActiveAlerts() {
    return Array.from(this.activeAlerts.values());
  }

  getAlertHistory(timeWindow = 86400000) { // 24 hours default
    const cutoffTime = Date.now() - timeWindow;
    return this.alertHistory.filter(a => a.timestamp >= cutoffTime);
  }

  getDetectedPatterns(timeWindow = 3600000) {
    const cutoffTime = Date.now() - timeWindow;
    return Array.from(this.patterns.values())
      .filter(p => p.detected >= cutoffTime);
  }
}

/**
 * Simple anomaly detector using statistical methods
 */
class AnomalyDetector {
  constructor() {
    this.threshold = 2; // Standard deviations
  }

  detectAnomalies(values, threshold = this.threshold) {
    if (values.length < 10) return [];

    const mean = values.reduce((sum, v) => sum + v.value, 0) / values.length;
    const variance = values.reduce((sum, v) => sum + Math.pow(v.value - mean, 2), 0) / values.length;
    const stdDev = Math.sqrt(variance);

    return values.filter(v => {
      const zScore = Math.abs(v.value - mean) / stdDev;
      return zScore > threshold;
    });
  }

  isAnomalous(value, baseline, threshold = this.threshold) {
    if (!baseline) return false;
    
    const zScore = Math.abs(value - baseline.mean) / baseline.stdDev;
    return zScore > threshold;
  }
}

/**
 * Pattern detector for identifying recurring issues
 */
class PatternDetector {
  constructor() {
    this.patterns = new Map();
  }

  detectPattern(events, timeWindow = 3600000) {
    // Implement pattern detection algorithms
    // This is a simplified version
    const patterns = [];
    
    // Group events by type and look for frequency patterns
    const eventsByType = new Map();
    for (const event of events) {
      if (!eventsByType.has(event.type)) {
        eventsByType.set(event.type, []);
      }
      eventsByType.get(event.type).push(event);
    }

    // Detect high-frequency patterns
    for (const [type, typeEvents] of eventsByType.entries()) {
      if (typeEvents.length > 5) { // Threshold for pattern
        patterns.push({
          type: 'HIGH_FREQUENCY',
          eventType: type,
          count: typeEvents.length,
          timeWindow
        });
      }
    }

    return patterns;
  }
}

// Export singleton instance
export const monitoringSystem = new MonitoringSystem();

/**
 * Convenience functions
 */
export function recordMetric(name, value, tags = {}) {
  monitoringSystem.recordMetric(name, value, null, tags);
}

export function triggerAlert(type, severity, message, context = {}) {
  const alert = {
    type,
    severity,
    message,
    ...context,
    timestamp: Date.now()
  };
  monitoringSystem.emit('alert:triggered', alert);
}

export function getSystemHealth() {
  return monitoringSystem.getSystemHealth();
}