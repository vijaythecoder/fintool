/**
 * Error Classification System for Cash Clearing Workflow
 * Provides sophisticated error categorization, impact assessment, and recovery strategies
 */

import { logger } from './logger.js';

/**
 * Error severity levels with business impact assessment
 */
export const ERROR_SEVERITY = {
  CRITICAL: {
    level: 1,
    description: 'System failure, requires immediate attention',
    autoRetry: false,
    escalationRequired: true,
    businessImpact: 'HIGH',
    slaThreshold: 0 // Immediate escalation
  },
  HIGH: {
    level: 2,
    description: 'Significant processing failure affecting batch',
    autoRetry: true,
    escalationRequired: true,
    businessImpact: 'HIGH',
    slaThreshold: 300000 // 5 minutes
  },
  MEDIUM: {
    level: 3,
    description: 'Processing error affecting individual transactions',
    autoRetry: true,
    escalationRequired: false,
    businessImpact: 'MEDIUM',
    slaThreshold: 1800000 // 30 minutes
  },
  LOW: {
    level: 4,
    description: 'Warning or minor issue with degraded functionality',
    autoRetry: true,
    escalationRequired: false,
    businessImpact: 'LOW',
    slaThreshold: 3600000 // 1 hour
  },
  INFO: {
    level: 5,
    description: 'Informational message for monitoring',
    autoRetry: false,
    escalationRequired: false,
    businessImpact: 'NONE',
    slaThreshold: null
  }
};

/**
 * Error categories with detailed classification
 */
export const ERROR_CATEGORIES = {
  SYSTEM_INFRASTRUCTURE: {
    category: 'SYSTEM_INFRASTRUCTURE',
    subcategories: {
      BIGQUERY_CONNECTION: {
        severity: ERROR_SEVERITY.HIGH,
        retryable: true,
        maxRetries: 3,
        backoffStrategy: 'exponential',
        patterns: ['connection failed', 'network error', 'timeout']
      },
      BIGQUERY_QUOTA: {
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true,
        maxRetries: 5,
        backoffStrategy: 'fixed',
        patterns: ['quota exceeded', 'rate limit', 'too many requests']
      },
      BIGQUERY_PERMISSION: {
        severity: ERROR_SEVERITY.CRITICAL,
        retryable: false,
        maxRetries: 0,
        backoffStrategy: 'none',
        patterns: ['permission denied', 'access denied', 'unauthorized']
      },
      BIGQUERY_SYNTAX: {
        severity: ERROR_SEVERITY.HIGH,
        retryable: false,
        maxRetries: 0,
        backoffStrategy: 'none',
        patterns: ['syntax error', 'invalid query', 'table not found']
      }
    }
  },

  AI_PROCESSING: {
    category: 'AI_PROCESSING',
    subcategories: {
      AI_RATE_LIMIT: {
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true,
        maxRetries: 5,
        backoffStrategy: 'exponential',
        patterns: ['rate limit exceeded', 'too many requests']
      },
      AI_TIMEOUT: {
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true,
        maxRetries: 3,
        backoffStrategy: 'exponential',
        patterns: ['timeout', 'request timeout', 'deadline exceeded']
      },
      AI_INVALID_RESPONSE: {
        severity: ERROR_SEVERITY.HIGH,
        retryable: true,
        maxRetries: 2,
        backoffStrategy: 'linear',
        patterns: ['invalid json', 'unexpected response', 'parse error']
      },
      AI_SERVICE_UNAVAILABLE: {
        severity: ERROR_SEVERITY.HIGH,
        retryable: true,
        maxRetries: 3,
        backoffStrategy: 'exponential',
        patterns: ['service unavailable', 'server error', '5xx']
      },
      AI_CONTENT_POLICY: {
        severity: ERROR_SEVERITY.LOW,
        retryable: false,
        maxRetries: 0,
        backoffStrategy: 'none',
        patterns: ['content policy', 'safety filter', 'inappropriate content']
      }
    }
  },

  DATA_VALIDATION: {
    category: 'DATA_VALIDATION',
    subcategories: {
      SCHEMA_VALIDATION: {
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: false,
        maxRetries: 0,
        backoffStrategy: 'none',
        patterns: ['schema mismatch', 'missing required field', 'invalid data type']
      },
      BUSINESS_RULE_VIOLATION: {
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: false,
        maxRetries: 0,
        backoffStrategy: 'none',
        patterns: ['business rule', 'validation failed', 'constraint violation']
      },
      DATA_QUALITY: {
        severity: ERROR_SEVERITY.LOW,
        retryable: false,
        maxRetries: 0,
        backoffStrategy: 'none',
        patterns: ['data quality', 'suspicious pattern', 'outlier detected']
      }
    }
  },

  WORKFLOW_ORCHESTRATION: {
    category: 'WORKFLOW_ORCHESTRATION',
    subcategories: {
      STEP_DEPENDENCY: {
        severity: ERROR_SEVERITY.HIGH,
        retryable: true,
        maxRetries: 2,
        backoffStrategy: 'linear',
        patterns: ['dependency not met', 'prerequisite failed', 'step out of order']
      },
      APPROVAL_TIMEOUT: {
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: false,
        maxRetries: 0,
        backoffStrategy: 'none',
        patterns: ['approval timeout', 'human approval required', 'pending approval']
      },
      BATCH_SIZE_EXCEEDED: {
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true,
        maxRetries: 1,
        backoffStrategy: 'adaptive',
        patterns: ['batch too large', 'size limit exceeded', 'memory limit']
      },
      CONCURRENT_UPDATE: {
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true,
        maxRetries: 3,
        backoffStrategy: 'exponential',
        patterns: ['concurrent update', 'version conflict', 'optimistic lock']
      }
    }
  },

  EXTERNAL_DEPENDENCIES: {
    category: 'EXTERNAL_DEPENDENCIES',
    subcategories: {
      NETWORK_CONNECTIVITY: {
        severity: ERROR_SEVERITY.HIGH,
        retryable: true,
        maxRetries: 5,
        backoffStrategy: 'exponential',
        patterns: ['network unreachable', 'connection refused', 'dns error']
      },
      THIRD_PARTY_API: {
        severity: ERROR_SEVERITY.MEDIUM,
        retryable: true,
        maxRetries: 3,
        backoffStrategy: 'exponential',
        patterns: ['api error', 'service error', 'external service']
      }
    }
  }
};

/**
 * Error classifier that analyzes errors and provides detailed categorization
 */
export class ErrorClassifier {
  constructor(options = {}) {
    this.enableMLClassification = options.enableMLClassification || false;
    this.customPatterns = options.customPatterns || [];
    this.businessContext = options.businessContext || {};
    
    // Error pattern frequency tracking
    this.patternFrequency = new Map();
    this.classificationHistory = [];
    this.maxHistorySize = options.maxHistorySize || 1000;
  }

  /**
   * Classify an error and provide comprehensive analysis
   */
  classifyError(error, context = {}) {
    const classification = {
      timestamp: new Date().toISOString(),
      error: this.normalizeError(error),
      context,
      analysis: {}
    };

    // Primary classification
    classification.analysis.primary = this.performPrimaryClassification(error);
    
    // Business impact assessment
    classification.analysis.businessImpact = this.assessBusinessImpact(
      classification.analysis.primary, 
      context
    );
    
    // Recovery strategy recommendation
    classification.analysis.recoveryStrategy = this.recommendRecoveryStrategy(
      classification.analysis.primary,
      context
    );
    
    // Pattern frequency analysis
    classification.analysis.patternAnalysis = this.analyzeErrorPattern(error);
    
    // Context-aware analysis
    classification.analysis.contextAnalysis = this.analyzeContext(context);
    
    // Store in history for trend analysis
    this.updateClassificationHistory(classification);
    
    return classification;
  }

  /**
   * Normalize error into consistent structure
   */
  normalizeError(error) {
    return {
      name: error.name || 'Unknown',
      message: error.message || 'No message provided',
      code: error.code || 'UNKNOWN_ERROR',
      stack: error.stack,
      step: error.step,
      transactionId: error.transactionId,
      batchId: error.batchId,
      timestamp: error.timestamp || new Date().toISOString(),
      retryable: error.retryable,
      context: error.context || {}
    };
  }

  /**
   * Perform primary error classification using pattern matching
   */
  performPrimaryClassification(error) {
    const errorText = `${error.message} ${error.code}`.toLowerCase();
    
    // Check custom patterns first
    for (const customPattern of this.customPatterns) {
      if (this.matchesPattern(errorText, customPattern.patterns)) {
        return {
          category: customPattern.category,
          subcategory: customPattern.subcategory,
          severity: customPattern.severity,
          confidence: customPattern.confidence || 0.9,
          source: 'custom_pattern'
        };
      }
    }

    // Check built-in categories
    for (const [categoryName, categoryData] of Object.entries(ERROR_CATEGORIES)) {
      for (const [subcategoryName, subcategoryData] of Object.entries(categoryData.subcategories)) {
        if (this.matchesPattern(errorText, subcategoryData.patterns)) {
          return {
            category: categoryName,
            subcategory: subcategoryName,
            severity: subcategoryData.severity,
            retryable: subcategoryData.retryable,
            maxRetries: subcategoryData.maxRetries,
            backoffStrategy: subcategoryData.backoffStrategy,
            confidence: 0.8,
            source: 'built_in_pattern'
          };
        }
      }
    }

    // Fallback classification
    return this.fallbackClassification(error);
  }

  /**
   * Check if error text matches any of the patterns
   */
  matchesPattern(errorText, patterns) {
    return patterns.some(pattern => {
      if (typeof pattern === 'string') {
        return errorText.includes(pattern.toLowerCase());
      } else if (pattern instanceof RegExp) {
        return pattern.test(errorText);
      }
      return false;
    });
  }

  /**
   * Fallback classification for unmatched errors
   */
  fallbackClassification(error) {
    let severity = ERROR_SEVERITY.MEDIUM;
    let retryable = true;

    // Basic heuristics
    if (error.message.includes('timeout')) {
      severity = ERROR_SEVERITY.MEDIUM;
      retryable = true;
    } else if (error.message.includes('permission') || error.message.includes('auth')) {
      severity = ERROR_SEVERITY.CRITICAL;
      retryable = false;
    } else if (error.message.includes('validation')) {
      severity = ERROR_SEVERITY.LOW;
      retryable = false;
    }

    return {
      category: 'UNKNOWN',
      subcategory: 'UNCLASSIFIED',
      severity,
      retryable,
      maxRetries: retryable ? 2 : 0,
      backoffStrategy: 'exponential',
      confidence: 0.3,
      source: 'fallback_heuristics'
    };
  }

  /**
   * Assess business impact based on error classification and context
   */
  assessBusinessImpact(classification, context) {
    const impact = {
      level: classification.severity.businessImpact,
      factors: [],
      monetaryImpact: 0,
      customerImpact: 'NONE',
      operationalImpact: 'NONE'
    };

    // Transaction volume impact
    if (context.batchSize) {
      if (context.batchSize > 1000) {
        impact.factors.push('Large batch affected');
        impact.level = this.escalateImpactLevel(impact.level);
      }
    }

    // Time sensitivity
    if (context.isEndOfDay || context.isMonthEnd) {
      impact.factors.push('Time-sensitive processing window');
      impact.level = this.escalateImpactLevel(impact.level);
    }

    // Amount threshold
    if (context.totalAmount && context.totalAmount > 1000000) {
      impact.factors.push('High-value transactions affected');
      impact.monetaryImpact = context.totalAmount;
      impact.level = this.escalateImpactLevel(impact.level);
    }

    // Customer-facing impact
    if (context.affectsCustomerReporting) {
      impact.customerImpact = 'HIGH';
      impact.factors.push('Customer reporting affected');
    }

    // Regulatory impact
    if (context.regulatoryReporting) {
      impact.operationalImpact = 'HIGH';
      impact.factors.push('Regulatory reporting at risk');
      impact.level = this.escalateImpactLevel(impact.level);
    }

    return impact;
  }

  /**
   * Escalate impact level
   */
  escalateImpactLevel(currentLevel) {
    const levels = ['NONE', 'LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
    const currentIndex = levels.indexOf(currentLevel);
    return levels[Math.min(currentIndex + 1, levels.length - 1)];
  }

  /**
   * Recommend recovery strategy based on classification
   */
  recommendRecoveryStrategy(classification, context) {
    const strategy = {
      immediate: [],
      shortTerm: [],
      longTerm: [],
      preventive: []
    };

    // Immediate actions based on classification
    if (classification.retryable) {
      strategy.immediate.push({
        action: 'AUTOMATIC_RETRY',
        parameters: {
          maxRetries: classification.maxRetries,
          backoffStrategy: classification.backoffStrategy,
          initialDelay: this.calculateInitialDelay(classification)
        }
      });
    }

    if (classification.severity.escalationRequired) {
      strategy.immediate.push({
        action: 'ESCALATE_TO_OPERATIONS',
        parameters: {
          severity: classification.severity.level,
          slaThreshold: classification.severity.slaThreshold
        }
      });
    }

    // Short-term recovery strategies
    switch (classification.category) {
      case 'AI_PROCESSING':
        strategy.shortTerm.push({
          action: 'FALLBACK_TO_RULE_BASED',
          description: 'Use rule-based processing if AI continues to fail'
        });
        break;
      
      case 'SYSTEM_INFRASTRUCTURE':
        strategy.shortTerm.push({
          action: 'REDUCE_BATCH_SIZE',
          description: 'Process smaller batches to reduce load'
        });
        break;
      
      case 'DATA_VALIDATION':
        strategy.shortTerm.push({
          action: 'QUARANTINE_INVALID_DATA',
          description: 'Move invalid transactions to review queue'
        });
        break;
    }

    // Long-term improvements
    strategy.longTerm.push({
      action: 'PATTERN_ANALYSIS',
      description: 'Analyze error patterns for systematic improvements'
    });

    return strategy;
  }

  /**
   * Calculate initial delay for retry strategy
   */
  calculateInitialDelay(classification) {
    const baseDelays = {
      'exponential': 1000,
      'linear': 2000,
      'fixed': 5000,
      'adaptive': 1500
    };

    return baseDelays[classification.backoffStrategy] || 1000;
  }

  /**
   * Analyze error pattern frequency and trends
   */
  analyzeErrorPattern(error) {
    const patternKey = `${error.code}-${error.step}`;
    
    // Update frequency tracking
    const currentCount = this.patternFrequency.get(patternKey) || 0;
    this.patternFrequency.set(patternKey, currentCount + 1);
    
    // Calculate frequency metrics
    const totalErrors = Array.from(this.patternFrequency.values())
      .reduce((sum, count) => sum + count, 0);
    
    const frequency = this.patternFrequency.get(patternKey) / totalErrors;
    
    // Detect trending patterns
    const recentOccurrences = this.classificationHistory
      .filter(h => h.error.code === error.code && h.error.step === error.step)
      .slice(-10);
    
    const isTrending = recentOccurrences.length >= 3 && 
      recentOccurrences.every(r => 
        Date.now() - new Date(r.timestamp).getTime() < 3600000 // Last hour
      );

    return {
      patternKey,
      frequency,
      totalOccurrences: this.patternFrequency.get(patternKey),
      isTrending,
      recentOccurrences: recentOccurrences.length,
      recommendation: this.getPatternRecommendation(frequency, isTrending)
    };
  }

  /**
   * Get recommendation based on pattern analysis
   */
  getPatternRecommendation(frequency, isTrending) {
    if (frequency > 0.1) { // More than 10% of all errors
      return 'HIGH_FREQUENCY_PATTERN_DETECTED - Consider systematic fix';
    } else if (isTrending) {
      return 'TRENDING_PATTERN_DETECTED - Monitor closely and prepare mitigation';
    } else if (frequency > 0.05) {
      return 'MODERATE_FREQUENCY_PATTERN - Review and optimize error handling';
    } else {
      return 'NORMAL_PATTERN_FREQUENCY - Continue standard monitoring';
    }
  }

  /**
   * Analyze context for additional insights
   */
  analyzeContext(context) {
    const analysis = {
      riskFactors: [],
      mitigationSuggestions: [],
      environmentalFactors: []
    };

    // Time-based analysis
    const hour = new Date().getHours();
    if (hour >= 0 && hour <= 6) {
      analysis.environmentalFactors.push('Off-hours processing - reduced support availability');
    } else if (hour >= 8 && hour <= 18) {
      analysis.environmentalFactors.push('Business hours - immediate support available');
    }

    // Load analysis
    if (context.systemLoad && context.systemLoad > 0.8) {
      analysis.riskFactors.push('High system load detected');
      analysis.mitigationSuggestions.push('Consider reducing batch size or scheduling during off-peak hours');
    }

    // Concurrency analysis
    if (context.concurrentWorkflows && context.concurrentWorkflows > 3) {
      analysis.riskFactors.push('Multiple concurrent workflows detected');
      analysis.mitigationSuggestions.push('Implement workflow queuing to prevent resource contention');
    }

    return analysis;
  }

  /**
   * Update classification history for trend analysis
   */
  updateClassificationHistory(classification) {
    this.classificationHistory.push(classification);
    
    // Maintain history size limit
    if (this.classificationHistory.length > this.maxHistorySize) {
      this.classificationHistory = this.classificationHistory.slice(-this.maxHistorySize);
    }
  }

  /**
   * Get error trends and insights
   */
  getErrorTrends(timeWindowMs = 3600000) { // Default: 1 hour
    const cutoffTime = Date.now() - timeWindowMs;
    const recentErrors = this.classificationHistory.filter(
      h => new Date(h.timestamp).getTime() > cutoffTime
    );

    const trends = {
      totalErrors: recentErrors.length,
      errorsByCategory: {},
      errorsBySeverity: {},
      retryableVsNonRetryable: { retryable: 0, nonRetryable: 0 },
      topErrorPatterns: [],
      trendingPatterns: []
    };

    // Analyze by category
    recentErrors.forEach(error => {
      const category = error.analysis.primary.category;
      const severity = error.analysis.primary.severity.level;
      
      trends.errorsByCategory[category] = (trends.errorsByCategory[category] || 0) + 1;
      trends.errorsBySeverity[severity] = (trends.errorsBySeverity[severity] || 0) + 1;
      
      if (error.analysis.primary.retryable) {
        trends.retryableVsNonRetryable.retryable++;
      } else {
        trends.retryableVsNonRetryable.nonRetryable++;
      }
    });

    // Find top error patterns
    const patternCounts = new Map();
    recentErrors.forEach(error => {
      const key = `${error.error.code}-${error.analysis.primary.category}`;
      patternCounts.set(key, (patternCounts.get(key) || 0) + 1);
    });

    trends.topErrorPatterns = Array.from(patternCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([pattern, count]) => ({ pattern, count }));

    return trends;
  }

  /**
   * Clear classification history and reset counters
   */
  reset() {
    this.classificationHistory = [];
    this.patternFrequency.clear();
    logger.info('Error classification system reset');
  }
}

// Export singleton instance
export const errorClassifier = new ErrorClassifier();

/**
 * Utility function to classify and log error
 */
export function classifyAndLogError(error, context = {}) {
  const classification = errorClassifier.classifyError(error, context);
  
  logger.error('Classified error', {
    classification,
    errorDetails: {
      message: error.message,
      code: error.code,
      stack: error.stack
    }
  });
  
  return classification;
}