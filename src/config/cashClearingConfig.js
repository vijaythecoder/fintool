/**
 * Cash Clearing Workflow Configuration
 * Centralized configuration for the 4-step cash clearing workflow
 */

export const defaultCashClearingConfig = {
  // Workflow steps configuration
  steps: [
    {
      stepNumber: 1,
      stepName: 'Query Cash Transactions',
      description: 'Retrieve unprocessed cash transactions with T_NOTFOUND pattern',
      requiredApproval: false,
      autoApproveThreshold: 1.0,
      timeoutMs: 30000,
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: 1000
      }
    },
    {
      stepNumber: 2,
      stepName: 'Pattern Matching',
      description: 'Apply processor patterns to identify transaction types',
      requiredApproval: false,
      autoApproveThreshold: 0.8,
      timeoutMs: 60000,
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: 2000
      }
    },
    {
      stepNumber: 3,
      stepName: 'GL Account Mapping',
      description: 'Map patterns to GL accounts and determine posting logic',
      requiredApproval: true,
      autoApproveThreshold: 0.95,
      timeoutMs: 45000,
      retryPolicy: {
        maxAttempts: 2,
        backoffMs: 3000
      }
    },
    {
      stepNumber: 4,
      stepName: 'Generate Suggestions',
      description: 'Create and store cash clearing suggestions',
      requiredApproval: false,
      autoApproveThreshold: 0.9,
      timeoutMs: 30000,
      retryPolicy: {
        maxAttempts: 3,
        backoffMs: 1000
      }
    }
  ],

  // Batch processing configuration
  batchProcessing: {
    batchSize: 100,
    concurrency: 3,
    retryAttempts: 3,
    retryDelay: 1000,
    maxBatchSize: 1000,
    minBatchSize: 10
  },

  // Approval settings
  approvalSettings: {
    requireHumanApproval: true,
    autoApproveThreshold: 0.9,
    approvalTimeoutMs: 3600000, // 1 hour
    escalationTimeoutMs: 86400000, // 24 hours
    approvalLevels: [
      {
        level: 1,
        threshold: 0.7,
        approvers: ['finance_analyst'],
        description: 'Standard approval for medium confidence'
      },
      {
        level: 2,
        threshold: 0.5,
        approvers: ['finance_manager'],
        description: 'Manager approval for low confidence'
      },
      {
        level: 3,
        threshold: 0.0,
        approvers: ['finance_director'],
        description: 'Director approval for very low confidence'
      }
    ]
  },

  // Error handling configuration
  errorHandling: {
    maxRetries: 3,
    escalationThreshold: 5,
    notificationChannels: ['email', 'slack'],
    circuitBreakerThreshold: 5,
    circuitBreakerWindow: 60000, // 1 minute
    deadLetterQueue: true
  },

  // AI model configuration
  aiConfiguration: {
    model: 'gpt-4-turbo',
    temperature: 0.1,
    maxTokens: 4000,
    timeout: 30000,
    fallbackModel: 'gpt-3.5-turbo'
  },

  // BigQuery configuration
  bigQueryConfiguration: {
    dataset: process.env.BIGQUERY_DATASET || 'financial_data',
    location: process.env.GCP_LOCATION || 'us-central1',
    queryTimeout: 60000,
    maxResults: 10000,
    enableQueryCache: true
  },

  // Monitoring and alerting
  monitoring: {
    enableMetrics: true,
    enableAuditLog: true,
    alertThresholds: {
      errorRate: 0.1, // 10%
      processingTime: 300000, // 5 minutes
      pendingApprovals: 100
    },
    dashboardUrl: process.env.DASHBOARD_URL
  },

  // Business rules
  businessRules: {
    maxTransactionAmount: 1000000, // $1M
    requireDualApproval: true,
    blocklistPatterns: ['SUSPICIOUS', 'FRAUD'],
    minimumConfidenceScore: 0.3
  }
};

/**
 * Environment-specific configurations
 */
export const environmentConfigs = {
  development: {
    ...defaultCashClearingConfig,
    batchProcessing: {
      ...defaultCashClearingConfig.batchProcessing,
      batchSize: 10,
      concurrency: 1
    },
    approvalSettings: {
      ...defaultCashClearingConfig.approvalSettings,
      requireHumanApproval: false,
      autoApproveThreshold: 0.5
    },
    monitoring: {
      ...defaultCashClearingConfig.monitoring,
      enableMetrics: false
    }
  },

  staging: {
    ...defaultCashClearingConfig,
    batchProcessing: {
      ...defaultCashClearingConfig.batchProcessing,
      batchSize: 50,
      concurrency: 2
    },
    approvalSettings: {
      ...defaultCashClearingConfig.approvalSettings,
      autoApproveThreshold: 0.8
    }
  },

  production: {
    ...defaultCashClearingConfig,
    errorHandling: {
      ...defaultCashClearingConfig.errorHandling,
      maxRetries: 5,
      escalationThreshold: 3
    },
    monitoring: {
      ...defaultCashClearingConfig.monitoring,
      enableMetrics: true,
      enableAuditLog: true
    }
  }
};

/**
 * Get configuration for current environment
 */
export function getConfig() {
  const env = process.env.NODE_ENV || 'development';
  return environmentConfigs[env] || defaultCashClearingConfig;
}

/**
 * Validation rules for transactions
 */
export const validationRules = {
  transaction: {
    required: ['transaction_id', 'amount', 'transaction_date'],
    amount: {
      min: 0.01,
      max: 1000000
    },
    transactionId: {
      pattern: /^[A-Z0-9_-]+$/,
      minLength: 8,
      maxLength: 50
    },
    description: {
      minLength: 5,
      maxLength: 500
    }
  },
  
  pattern: {
    required: ['pattern_id', 'pattern_name', 'pattern_type'],
    confidenceWeight: {
      min: 0.0,
      max: 1.0
    },
    priorityOrder: {
      min: 1,
      max: 1000
    }
  },

  glMapping: {
    required: ['gl_account_code', 'gl_account_name', 'debit_credit_indicator'],
    confidence: {
      min: 0.0,
      max: 1.0
    },
    accountCode: {
      pattern: /^\d{4,6}$/
    }
  }
};

/**
 * Pattern matching rules and weights
 */
export const patternMatchingRules = {
  // Reference number matching
  referenceNumber: {
    weight: 0.4,
    rules: [
      { pattern: /INV[-_]?\d{6,}/, confidence: 0.9, type: 'INVOICE' },
      { pattern: /PO[-_]?\d{6,}/, confidence: 0.8, type: 'PURCHASE_ORDER' },
      { pattern: /REF[-_]?\d{6,}/, confidence: 0.7, type: 'REFERENCE' },
      { pattern: /TXN[-_]?\d{6,}/, confidence: 0.6, type: 'TRANSACTION' }
    ]
  },

  // Description-based matching
  description: {
    weight: 0.3,
    rules: [
      { pattern: /WIRE.*TRANSFER/i, confidence: 0.8, type: 'WIRE_TRANSFER' },
      { pattern: /ACH.*PAYMENT/i, confidence: 0.7, type: 'ACH_PAYMENT' },
      { pattern: /CREDIT.*CARD/i, confidence: 0.6, type: 'CREDIT_CARD' },
      { pattern: /CHECK.*PAYMENT/i, confidence: 0.7, type: 'CHECK' },
      { pattern: /PAYROLL/i, confidence: 0.9, type: 'PAYROLL' }
    ]
  },

  // Amount-based patterns
  amount: {
    weight: 0.2,
    rules: [
      { range: [0, 100], confidence: 0.5, type: 'SMALL_PAYMENT' },
      { range: [100, 10000], confidence: 0.7, type: 'MEDIUM_PAYMENT' },
      { range: [10000, 100000], confidence: 0.6, type: 'LARGE_PAYMENT' },
      { range: [100000, Infinity], confidence: 0.4, type: 'VERY_LARGE_PAYMENT' }
    ]
  },

  // Date pattern analysis
  datePattern: {
    weight: 0.1,
    rules: [
      { dayOfWeek: [1, 5], confidence: 0.8, type: 'BUSINESS_DAY' },
      { dayOfWeek: [0, 6], confidence: 0.3, type: 'WEEKEND' },
      { monthEnd: true, confidence: 0.9, type: 'MONTH_END' },
      { quarterEnd: true, confidence: 0.9, type: 'QUARTER_END' }
    ]
  }
};

/**
 * GL Account mapping configuration
 */
export const glAccountMappings = {
  // Standard GL account categories
  categories: {
    ASSET: {
      range: [1000, 1999],
      defaultDebitCredit: 'DR',
      accounts: {
        1010: { name: 'Cash - Operating Account', autoApprove: 0.95 },
        1020: { name: 'Cash - Payroll Account', autoApprove: 0.90 },
        1200: { name: 'Accounts Receivable', autoApprove: 0.85 },
        1500: { name: 'Inventory', autoApprove: 0.80 }
      }
    },
    LIABILITY: {
      range: [2000, 2999],
      defaultDebitCredit: 'CR',
      accounts: {
        2100: { name: 'Accounts Payable', autoApprove: 0.90 },
        2200: { name: 'Accrued Expenses', autoApprove: 0.85 },
        2500: { name: 'Notes Payable', autoApprove: 0.75 }
      }
    },
    REVENUE: {
      range: [4000, 4999],
      defaultDebitCredit: 'CR',
      accounts: {
        4100: { name: 'Sales Revenue', autoApprove: 0.95 },
        4200: { name: 'Service Revenue', autoApprove: 0.90 },
        4900: { name: 'Other Revenue', autoApprove: 0.70 }
      }
    },
    EXPENSE: {
      range: [5000, 5999],
      defaultDebitCredit: 'DR',
      accounts: {
        5100: { name: 'Credit Card Processing Fees', autoApprove: 0.90 },
        5200: { name: 'Bank Fees', autoApprove: 0.95 },
        5300: { name: 'Office Expenses', autoApprove: 0.80 },
        5400: { name: 'Travel Expenses', autoApprove: 0.75 }
      }
    }
  },

  // Pattern to GL mapping rules
  mappingRules: [
    {
      patternType: 'WIRE_TRANSFER',
      glAccount: '1010',
      confidence: 0.9,
      requiresApproval: false
    },
    {
      patternType: 'ACH_PAYMENT',
      glAccount: '1010',
      confidence: 0.85,
      requiresApproval: false
    },
    {
      patternType: 'CREDIT_CARD',
      glAccount: '5100',
      confidence: 0.8,
      requiresApproval: true
    },
    {
      patternType: 'INVOICE',
      glAccount: '1200',
      confidence: 0.9,
      requiresApproval: false
    },
    {
      patternType: 'PAYROLL',
      glAccount: '1020',
      confidence: 0.95,
      requiresApproval: false
    }
  ]
};

/**
 * Confidence scoring weights
 */
export const confidenceWeights = {
  patternMatch: 0.4,        // How well the pattern matches
  glAccountMapping: 0.3,    // Confidence in GL account selection
  amountValidation: 0.1,    // Amount reasonableness
  dateValidation: 0.1,      // Date pattern validation
  businessRules: 0.1        // Business rule compliance
};

/**
 * Export helper function to merge custom config
 */
export function createCustomConfig(customConfig = {}) {
  const baseConfig = getConfig();
  
  return {
    ...baseConfig,
    ...customConfig,
    batchProcessing: {
      ...baseConfig.batchProcessing,
      ...(customConfig.batchProcessing || {})
    },
    approvalSettings: {
      ...baseConfig.approvalSettings,
      ...(customConfig.approvalSettings || {})
    },
    errorHandling: {
      ...baseConfig.errorHandling,
      ...(customConfig.errorHandling || {})
    }
  };
}