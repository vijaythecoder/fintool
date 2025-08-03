/**
 * Comprehensive Prompt Engineering System for Cash Clearing Pattern Matching
 * 
 * This module provides structured prompts for the 4-step cash clearing workflow:
 * 1. Pattern Identification
 * 2. Confidence Scoring 
 * 3. GL Account Selection
 * 4. Reasoning Generation
 */

import { format } from 'date-fns';

/**
 * MAIN SYSTEM PROMPTS
 */

export const SYSTEM_PROMPTS = {
  /**
   * Pattern Identification System Prompt
   */
  PATTERN_IDENTIFICATION: {
    role: 'system',
    content: `You are an expert financial transaction pattern matching AI specialist with deep knowledge of cash clearing workflows.

Your primary responsibility is to analyze cash transaction data and identify patterns that will enable accurate classification and GL account mapping.

CORE COMPETENCIES:
- Transaction pattern recognition (SETTLEMENT, TOPUP, FOREX, WIRE_TRANSFER, ACH_PAYMENT, etc.)
- Reference number analysis and parsing
- Description text analysis using financial terminology
- Amount pattern detection and anomaly identification
- Temporal pattern analysis (business days, month-end, quarter-end)

PATTERN MATCHING FRAMEWORK:
1. REFERENCE PATTERNS: Invoice numbers, PO numbers, transaction IDs
2. DESCRIPTION PATTERNS: Payment methods, merchant names, service types
3. AMOUNT PATTERNS: Round numbers, recurring amounts, threshold-based classifications
4. TEMPORAL PATTERNS: Processing schedules, business cycles
5. COMPOSITE PATTERNS: Multi-field pattern combinations

CLASSIFICATION TYPES:
- SETTLEMENT: Settlement transactions between accounts
- TOPUP: Account funding and reload transactions
- FOREX: Foreign exchange transactions
- WIRE_TRANSFER: Wire transfer payments
- ACH_PAYMENT: Automated clearing house payments
- CHECK_PAYMENT: Check-based transactions
- CREDIT_CARD: Credit card processing transactions
- PAYROLL: Payroll-related transactions
- INVOICE: Invoice payment transactions
- PURCHASE_ORDER: Purchase order payments
- REFUND: Refund transactions
- FEE: Fee-based transactions
- INTEREST: Interest payments or charges
- ADJUSTMENT: Account adjustments

OUTPUT REQUIREMENTS:
- Return structured JSON responses only
- Provide confidence scores between 0.0 and 1.0
- Include detailed reasoning for each pattern match
- Identify multiple potential patterns when applicable
- Flag ambiguous cases for human review

CONFIDENCE SCORING GUIDELINES:
- 0.9-1.0: Highly confident, clear pattern match with multiple confirming signals
- 0.7-0.89: Confident, good pattern match with some confirming signals
- 0.5-0.69: Moderate confidence, pattern match with limited signals
- 0.3-0.49: Low confidence, weak pattern match or conflicting signals
- 0.0-0.29: Very low confidence, no clear pattern or insufficient data

Always prioritize accuracy over speed and provide clear explanations for your decisions.`
  },

  /**
   * GL Account Mapping System Prompt
   */
  GL_ACCOUNT_MAPPING: {
    role: 'system',
    content: `You are an expert financial GL (General Ledger) account mapping specialist with deep knowledge of accounting principles and cash clearing workflows.

Your responsibility is to select the optimal GL account mappings for transactions based on identified patterns, ensuring compliance with accounting standards and business rules.

ACCOUNTING PRINCIPLES:
- Asset accounts (1000-1999): Cash, Receivables, Inventory - Normal balance DEBIT
- Liability accounts (2000-2999): Payables, Accrued expenses - Normal balance CREDIT  
- Revenue accounts (4000-4999): Sales, Service revenue - Normal balance CREDIT
- Expense accounts (5000-5999): Operating expenses, Fees - Normal balance DEBIT
- Equity accounts (3000-3999): Capital, Retained earnings - Normal balance CREDIT

DEBIT/CREDIT LOGIC:
- Cash receipts: DEBIT cash account, CREDIT revenue/liability account
- Cash payments: CREDIT cash account, DEBIT expense/asset account
- Account transfers: DEBIT receiving account, CREDIT sending account

GL ACCOUNT SELECTION CRITERIA:
1. PATTERN ALIGNMENT: Account must match the transaction pattern type
2. AMOUNT REASONABLENESS: Account usage should align with amount ranges
3. BUSINESS UNIT COMPATIBILITY: Account must be valid for the business unit
4. REGULATORY COMPLIANCE: Selection must comply with accounting standards
5. APPROVAL THRESHOLDS: Consider auto-approval limits for account categories

CONFIDENCE FACTORS:
- Pattern Match Strength (40%): How well the pattern aligns with account purpose
- Amount Validation (20%): Amount appropriateness for account type
- Business Rules (20%): Compliance with company-specific rules
- Historical Precedent (10%): Similar past transactions
- Risk Assessment (10%): Potential for errors or fraud

AUTO-APPROVAL CRITERIA:
- Confidence score >= 0.95 AND pattern match >= 0.9
- Account is in pre-approved list for pattern type
- Amount is within auto-approval limits
- No risk flags or blocklist patterns detected

OUTPUT REQUIREMENTS:
- Select single best GL account mapping
- Provide alternative mappings if applicable
- Include detailed reasoning for selection
- Flag cases requiring human approval
- Validate debit/credit logic consistency

Always ensure selections maintain accounting equation balance and follow proper internal controls.`
  },

  /**
   * Validation and Quality Control System Prompt
   */
  VALIDATION_CONTROL: {
    role: 'system',
    content: `You are a financial data validation and quality control specialist responsible for ensuring the accuracy and compliance of cash clearing suggestions.

Your role is to perform comprehensive validation checks on pattern matches and GL account mappings before final processing.

VALIDATION CATEGORIES:

1. DATA INTEGRITY VALIDATION:
   - Required fields presence and format
   - Amount validation (positive, reasonable ranges)
   - Date validation (business day, reasonable timeframe)
   - Account code format and existence

2. ACCOUNTING VALIDATION:
   - Debit/Credit indicator correctness
   - Account category appropriateness
   - Balance equation compliance
   - Posting rule consistency

3. BUSINESS RULE VALIDATION:
   - Amount threshold compliance
   - Approval requirement assessment
   - Blocklist pattern detection
   - Dual approval requirements

4. CONFIDENCE VALIDATION:
   - Score reasonableness assessment
   - Supporting evidence adequacy
   - Alternative option consideration
   - Risk factor evaluation

5. COMPLIANCE VALIDATION:
   - Regulatory requirement adherence
   - Internal control compliance
   - Audit trail completeness
   - Documentation adequacy

QUALITY SCORES:
- EXCELLENT (0.95-1.0): Meets all criteria, ready for auto-approval
- GOOD (0.8-0.94): Minor issues, acceptable for approval
- ACCEPTABLE (0.6-0.79): Some concerns, requires review
- POOR (0.4-0.59): Multiple issues, needs improvement
- UNACCEPTABLE (0.0-0.39): Major problems, requires rejection

ERROR CATEGORIES:
- CRITICAL: Data corruption, regulatory violations, accounting errors
- HIGH: Business rule violations, approval threshold exceeded
- MEDIUM: Data quality issues, missing validations
- LOW: Formatting issues, minor inconsistencies

OUTPUT REQUIREMENTS:
- Provide validation score and status
- List all identified issues by category
- Recommend remediation actions
- Flag for appropriate approval level
- Generate audit trail entries`
  }
};

/**
 * USER MESSAGE TEMPLATES
 */

export const MESSAGE_TEMPLATES = {
  /**
   * Pattern Matching Request Template
   */
  PATTERN_MATCHING: {
    createMessage: (transactions, patterns, context = {}) => ({
      role: 'user',
      content: JSON.stringify({
        request_type: 'pattern_matching',
        context: {
          batch_id: context.batchId,
          processing_date: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
          total_transactions: transactions.length,
          available_patterns: patterns.length,
          ...context
        },
        available_patterns: patterns.map(p => ({
          pattern_id: p.pattern_id,
          pattern_name: p.pattern_name,
          pattern_type: p.pattern_type,
          pattern_regex: p.pattern_regex,
          confidence_weight: p.confidence_weight,
          priority_order: p.priority_order,
          metadata: p.metadata
        })),
        transactions: transactions.map(t => ({
          transaction_id: t.transaction_id,
          amount: t.amount,
          reference_number: t.reference_number,
          description: t.description,
          transaction_date: t.transaction_date,
          account_id: t.account_id,
          currency_code: t.currency_code,
          source_system: t.source_system,
          original_data: t.original_data
        })),
        processing_instructions: {
          analyze_patterns: true,
          calculate_confidence: true,
          provide_reasoning: true,
          identify_multiple_matches: true,
          flag_ambiguous_cases: true
        }
      })
    })
  },

  /**
   * GL Account Mapping Request Template
   */
  GL_ACCOUNT_MAPPING: {
    createMessage: (transaction, glPatterns, context = {}) => ({
      role: 'user',
      content: JSON.stringify({
        request_type: 'gl_account_mapping',
        context: {
          transaction_id: transaction.transaction_id,
          batch_id: context.batchId,
          approval_threshold: context.approvalThreshold || 0.95,
          auto_approve_enabled: context.autoApproveEnabled || true,
          ...context
        },
        transaction: {
          transaction_id: transaction.transaction_id,
          amount: transaction.amount,
          description: transaction.description,
          matched_patterns: transaction.matched_patterns,
          pattern_confidence: transaction.confidence_scores,
          account_id: transaction.account_id,
          currency_code: transaction.currency_code,
          transaction_date: transaction.transaction_date
        },
        available_gl_patterns: glPatterns.map(gl => ({
          gl_pattern_id: gl.gl_pattern_id,
          pattern_id: gl.pattern_id,
          gl_account_code: gl.gl_account_code,
          gl_account_name: gl.gl_account_name,
          debit_credit_indicator: gl.debit_credit_indicator,
          account_category: gl.account_category,
          business_unit: gl.business_unit,
          cost_center: gl.cost_center,
          mapping_confidence: gl.mapping_confidence,
          auto_approve_threshold: gl.auto_approve_threshold,
          requires_approval: gl.requires_approval
        })),
        mapping_requirements: {
          select_optimal_account: true,
          validate_debit_credit: true,
          assess_approval_needs: true,
          provide_alternatives: true,
          explain_reasoning: true
        }
      })
    })
  },

  /**
   * Batch Validation Request Template
   */
  BATCH_VALIDATION: {
    createMessage: (suggestions, validationRules, context = {}) => ({
      role: 'user',
      content: JSON.stringify({
        request_type: 'batch_validation',
        context: {
          batch_id: context.batchId,
          total_suggestions: suggestions.length,
          validation_level: context.validationLevel || 'COMPREHENSIVE',
          auto_approve_threshold: context.autoApproveThreshold || 0.95,
          ...context
        },
        suggestions: suggestions.map(s => ({
          suggestion_id: s.suggestion_id,
          transaction_id: s.transaction_id,
          pattern_matched: s.pattern_matched,
          gl_account_code: s.gl_account_code,
          gl_account_name: s.gl_account_name,
          debit_credit_indicator: s.debit_credit_indicator,
          amount: s.amount,
          confidence_score: s.confidence_score,
          reasoning: s.reasoning
        })),
        validation_rules: validationRules,
        validation_checks: {
          data_integrity: true,
          accounting_validity: true,
          business_rules: true,
          confidence_assessment: true,
          compliance_check: true
        }
      })
    })
  }
};

/**
 * FEW-SHOT EXAMPLES
 */

export const FEW_SHOT_EXAMPLES = {
  /**
   * Pattern Matching Examples
   */
  PATTERN_MATCHING: [
    {
      input: {
        transaction: {
          transaction_id: "TXN_001",
          amount: 1250.50,
          reference_number: "INV123456",
          description: "INVOICE PAYMENT FOR SERVICES",
          transaction_date: "2024-01-15"
        },
        patterns: [
          {
            pattern_id: "PTN_001",
            pattern_name: "Invoice Reference Match",
            pattern_type: "REFERENCE",
            pattern_regex: "INV[-_]?\\d{6,}",
            confidence_weight: 0.8
          }
        ]
      },
      output: {
        matches: {
          "TXN_001": [
            {
              pattern_id: "PTN_001",
              pattern_name: "Invoice Reference Match",
              match_strength: 0.95,
              match_details: "Strong regex match on reference number INV123456, typical invoice payment description"
            }
          ]
        },
        confidences: {
          "TXN_001": {
            overall_confidence: 0.92,
            pattern_confidence: 0.95
          }
        },
        reasoning: {
          "TXN_001": "High confidence invoice payment: reference number follows standard INV pattern, description explicitly mentions invoice payment, amount is reasonable for business transaction"
        }
      }
    },
    {
      input: {
        transaction: {
          transaction_id: "TXN_002",
          amount: 25000.00,
          reference_number: "WIRE789012",
          description: "INTERNATIONAL WIRE TRANSFER",
          transaction_date: "2024-01-15"
        },
        patterns: [
          {
            pattern_id: "PTN_003",
            pattern_name: "Wire Transfer Match",
            pattern_type: "DESCRIPTION",
            pattern_regex: "WIRE.*TRANSFER",
            confidence_weight: 0.6
          }
        ]
      },
      output: {
        matches: {
          "TXN_002": [
            {
              pattern_id: "PTN_003",
              pattern_name: "Wire Transfer Match",
              match_strength: 0.85,
              match_details: "Clear wire transfer description, large amount typical for international transfers"
            }
          ]
        },
        confidences: {
          "TXN_002": {
            overall_confidence: 0.82,
            pattern_confidence: 0.85
          }
        },
        reasoning: {
          "TXN_002": "Strong wire transfer pattern: description explicitly mentions wire transfer, amount is substantial suggesting international or business transfer, reference follows wire format"
        }
      }
    }
  ],

  /**
   * GL Account Mapping Examples
   */
  GL_ACCOUNT_MAPPING: [
    {
      input: {
        transaction: {
          transaction_id: "TXN_001",
          amount: 1250.50,
          matched_patterns: [
            {
              pattern_name: "Invoice Reference Match",
              confidence: 0.95
            }
          ]
        },
        gl_patterns: [
          {
            gl_account_code: "1200",
            gl_account_name: "Accounts Receivable",
            debit_credit_indicator: "DR",
            account_category: "ASSET",
            mapping_confidence: 0.9
          }
        ]
      },
      output: {
        gl_account_code: "1200",
        gl_account_name: "Accounts Receivable",
        debit_credit_indicator: "DR",
        account_category: "ASSET",
        confidence: 0.93,
        requires_approval: false,
        mapping_reasoning: "Invoice payment suggests accounts receivable collection, debit increases asset account, high pattern confidence supports auto-approval",
        alternative_mappings: []
      }
    },
    {
      input: {
        transaction: {
          transaction_id: "TXN_002",
          amount: 500.00,
          matched_patterns: [
            {
              pattern_name: "Credit Card Processing",
              confidence: 0.7
            }
          ]
        },
        gl_patterns: [
          {
            gl_account_code: "5100",
            gl_account_name: "Credit Card Processing Fees",
            debit_credit_indicator: "DR",
            account_category: "EXPENSE",
            mapping_confidence: 0.8
          }
        ]
      },
      output: {
        gl_account_code: "5100",
        gl_account_name: "Credit Card Processing Fees",
        debit_credit_indicator: "DR",
        account_category: "EXPENSE",
        confidence: 0.75,
        requires_approval: true,
        mapping_reasoning: "Credit card processing fee expense, debit increases expense account, moderate confidence requires approval",
        alternative_mappings: [
          {
            gl_account_code: "5200",
            gl_account_name: "Bank Fees",
            confidence: 0.6
          }
        ]
      }
    }
  ]
};

/**
 * ERROR HANDLING PROMPTS
 */

export const ERROR_HANDLING_PROMPTS = {
  /**
   * Ambiguous Pattern Handling
   */
  AMBIGUOUS_PATTERN: {
    role: 'system',
    content: `You are handling an ambiguous transaction pattern that could not be confidently classified.

AMBIGUITY RESOLUTION STRATEGY:
1. Identify all possible pattern matches
2. Analyze conflicting signals
3. Determine primary classification criteria
4. Provide ranked alternatives
5. Recommend human review if necessary

OUTPUT FORMAT:
{
  "primary_classification": "best_guess_pattern",
  "confidence": 0.0-1.0,
  "alternatives": [
    {
      "pattern": "alternative_pattern",
      "confidence": 0.0-1.0,
      "reasoning": "explanation"
    }
  ],
  "ambiguity_factors": ["list", "of", "conflicting", "signals"],
  "recommendation": "AUTO_PROCESS|HUMAN_REVIEW|ADDITIONAL_DATA_NEEDED",
  "required_data": ["additional", "fields", "needed"]
}`
  },

  /**
   * Low Confidence Handling
   */
  LOW_CONFIDENCE: {
    role: 'system',
    content: `You are handling a transaction with low confidence scores that require special attention.

LOW CONFIDENCE RESPONSE STRATEGY:
1. Identify factors causing low confidence
2. Suggest data enrichment opportunities
3. Provide conservative classification
4. Recommend appropriate approval levels
5. Generate detailed audit trail

ESCALATION CRITERIA:
- Confidence < 0.3: Requires director approval
- Confidence 0.3-0.5: Requires manager approval  
- Confidence 0.5-0.7: Requires analyst approval
- Amount > $10,000: Requires dual approval

OUTPUT FORMAT:
{
  "classification": "conservative_pattern",
  "confidence": 0.0-1.0,
  "risk_factors": ["list", "of", "risk", "factors"],
  "approval_level": "ANALYST|MANAGER|DIRECTOR",
  "additional_checks": ["required", "validations"],
  "escalation_reason": "explanation_for_escalation"
}`
  },

  /**
   * Data Quality Issues
   */
  DATA_QUALITY: {
    role: 'system',
    content: `You are handling transactions with data quality issues that impact pattern matching accuracy.

DATA QUALITY ASSESSMENT:
1. Identify missing required fields
2. Validate data format and ranges
3. Detect potential data corruption
4. Assess impact on classification
5. Recommend data remediation

QUALITY LEVELS:
- HIGH: All required fields present, valid formats
- MEDIUM: Minor issues, classification possible
- LOW: Significant issues, limited classification
- CRITICAL: Major issues, classification not recommended

OUTPUT FORMAT:
{
  "quality_score": 0.0-1.0,
  "quality_level": "HIGH|MEDIUM|LOW|CRITICAL",
  "data_issues": [
    {
      "field": "field_name",
      "issue": "description",
      "severity": "HIGH|MEDIUM|LOW",
      "impact": "classification_impact"
    }
  ],
  "remediation_actions": ["suggested", "fixes"],
  "processing_recommendation": "PROCEED|HOLD|REJECT"
}`
  }
};

/**
 * BATCH PROCESSING TEMPLATES
 */

export const BATCH_PROCESSING = {
  /**
   * Batch Pattern Matching Template
   */
  BATCH_PATTERN_MATCHING: {
    createBatchMessage: (transactionBatch, patterns, batchContext) => ({
      role: 'user',
      content: JSON.stringify({
        request_type: 'batch_pattern_matching',
        batch_info: {
          batch_id: batchContext.batchId,
          batch_size: transactionBatch.length,
          batch_number: batchContext.batchNumber,
          total_batches: batchContext.totalBatches,
          processing_timestamp: new Date().toISOString()
        },
        processing_mode: 'PARALLEL',
        error_handling: 'CONTINUE_ON_ERROR',
        quality_threshold: batchContext.qualityThreshold || 0.5,
        patterns: patterns,
        transactions: transactionBatch,
        batch_requirements: {
          maintain_consistency: true,
          track_processing_time: true,
          provide_batch_summary: true,
          handle_edge_cases: true
        }
      })
    }),

    expectedBatchOutput: {
      batch_id: "string",
      processing_summary: {
        total_processed: "number",
        successful_matches: "number",
        failed_matches: "number",
        average_confidence: "number",
        processing_time_ms: "number"
      },
      results: {
        // Individual transaction results
      },
      batch_issues: [
        {
          issue_type: "string",
          affected_transactions: ["array"],
          severity: "HIGH|MEDIUM|LOW",
          recommendation: "string"
        }
      ]
    }
  },

  /**
   * Batch Validation Template
   */
  BATCH_VALIDATION: {
    createValidationMessage: (suggestionsBatch, validationConfig) => ({
      role: 'user',
      content: JSON.stringify({
        request_type: 'batch_validation',
        validation_config: {
          validation_level: validationConfig.level || 'STANDARD',
          auto_approve_threshold: validationConfig.autoApproveThreshold || 0.95,
          risk_tolerance: validationConfig.riskTolerance || 'MEDIUM',
          compliance_mode: validationConfig.complianceMode || 'STRICT'
        },
        suggestions_batch: suggestionsBatch,
        validation_rules: validationConfig.rules,
        batch_requirements: {
          cross_validate_consistency: true,
          identify_outliers: true,
          assess_batch_risk: true,
          generate_approval_recommendations: true
        }
      })
    })
  }
};

/**
 * CONTEXT INJECTION STRATEGIES
 */

export const CONTEXT_STRATEGIES = {
  /**
   * Customer Account Context
   */
  CUSTOMER_ACCOUNT_CONTEXT: (customerInfo, accountHistory) => ({
    customer_profile: {
      customer_id: customerInfo.customer_id,
      account_type: customerInfo.account_type,
      risk_profile: customerInfo.risk_profile,
      typical_transaction_patterns: customerInfo.typical_patterns,
      historical_amounts: accountHistory.amount_ranges,
      processing_preferences: customerInfo.preferences
    },
    historical_context: {
      recent_transactions: accountHistory.recent_transactions.slice(0, 10),
      pattern_frequency: accountHistory.pattern_frequency,
      seasonal_patterns: accountHistory.seasonal_patterns,
      anomaly_indicators: accountHistory.anomalies
    }
  }),

  /**
   * Business Rules Context
   */
  BUSINESS_RULES_CONTEXT: (businessRules, complianceSettings) => ({
    business_rules: {
      approval_thresholds: businessRules.approval_thresholds,
      auto_approve_patterns: businessRules.auto_approve_patterns,
      blocked_patterns: businessRules.blocked_patterns,
      dual_approval_required: businessRules.dual_approval_required
    },
    compliance_requirements: {
      regulatory_rules: complianceSettings.regulatory_rules,
      audit_requirements: complianceSettings.audit_requirements,
      documentation_standards: complianceSettings.documentation_standards
    }
  }),

  /**
   * Temporal Context
   */
  TEMPORAL_CONTEXT: (processingDate, businessCalendar) => ({
    processing_context: {
      processing_date: processingDate,
      day_of_week: format(processingDate, 'EEEE'),
      is_business_day: businessCalendar.isBusinessDay(processingDate),
      is_month_end: businessCalendar.isMonthEnd(processingDate),
      is_quarter_end: businessCalendar.isQuarterEnd(processingDate),
      fiscal_period: businessCalendar.getFiscalPeriod(processingDate)
    },
    seasonal_factors: {
      peak_processing_periods: businessCalendar.peak_periods,
      holiday_schedule: businessCalendar.holidays,
      typical_volumes: businessCalendar.typical_volumes
    }
  })
};

/**
 * OUTPUT FORMAT SPECIFICATIONS
 */

export const OUTPUT_FORMATS = {
  /**
   * Pattern Matching Output Format
   */
  PATTERN_MATCHING_OUTPUT: {
    type: "object",
    required: ["transaction_results", "batch_summary"],
    properties: {
      transaction_results: {
        type: "object",
        patternProperties: {
          "^TXN_": {
            type: "object",
            required: ["patterns_matched", "confidence_scores", "reasoning"],
            properties: {
              patterns_matched: {
                type: "array",
                items: {
                  type: "object",
                  required: ["pattern_id", "pattern_name", "match_strength"],
                  properties: {
                    pattern_id: { type: "string" },
                    pattern_name: { type: "string" },
                    match_strength: { type: "number", minimum: 0, maximum: 1 },
                    match_details: { type: "string" }
                  }
                }
              },
              confidence_scores: {
                type: "object",
                required: ["overall_confidence"],
                properties: {
                  overall_confidence: { type: "number", minimum: 0, maximum: 1 },
                  pattern_confidence: { type: "number", minimum: 0, maximum: 1 },
                  amount_confidence: { type: "number", minimum: 0, maximum: 1 },
                  description_confidence: { type: "number", minimum: 0, maximum: 1 }
                }
              },
              reasoning: { type: "string" },
              quality_flags: {
                type: "array",
                items: { type: "string" }
              },
              recommended_action: {
                type: "string",
                enum: ["AUTO_PROCESS", "HUMAN_REVIEW", "ADDITIONAL_DATA_NEEDED"]
              }
            }
          }
        }
      },
      batch_summary: {
        type: "object",
        required: ["total_processed", "successful_matches", "average_confidence"],
        properties: {
          total_processed: { type: "integer" },
          successful_matches: { type: "integer" },
          failed_matches: { type: "integer" },
          average_confidence: { type: "number", minimum: 0, maximum: 1 },
          processing_time_ms: { type: "integer" },
          quality_issues: {
            type: "array",
            items: {
              type: "object",
              properties: {
                issue_type: { type: "string" },
                count: { type: "integer" },
                severity: { type: "string", enum: ["HIGH", "MEDIUM", "LOW"] }
              }
            }
          }
        }
      }
    }
  },

  /**
   * GL Account Mapping Output Format
   */
  GL_MAPPING_OUTPUT: {
    type: "object",
    required: ["gl_account_code", "gl_account_name", "debit_credit_indicator", "confidence"],
    properties: {
      gl_account_code: { type: "string", pattern: "^\\d{4,6}$" },
      gl_account_name: { type: "string" },
      debit_credit_indicator: { type: "string", enum: ["DR", "CR"] },
      account_category: { type: "string", enum: ["ASSET", "LIABILITY", "REVENUE", "EXPENSE", "EQUITY"] },
      business_unit: { type: "string" },
      cost_center: { type: "string" },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      requires_approval: { type: "boolean" },
      approval_level: { type: "string", enum: ["AUTO", "ANALYST", "MANAGER", "DIRECTOR"] },
      mapping_reasoning: { type: "string" },
      risk_factors: {
        type: "array",
        items: { type: "string" }
      },
      alternative_mappings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            gl_account_code: { type: "string" },
            gl_account_name: { type: "string" },
            confidence: { type: "number", minimum: 0, maximum: 1 },
            reason: { type: "string" }
          }
        }
      },
      validation_checks: {
        type: "object",
        properties: {
          amount_reasonable: { type: "boolean" },
          account_exists: { type: "boolean" },
          debit_credit_valid: { type: "boolean" },
          business_rules_met: { type: "boolean" },
          compliance_check: { type: "boolean" }
        }
      }
    }
  }
};

/**
 * PROMPT BUILDER UTILITY FUNCTIONS
 */

export class CashClearingPromptBuilder {
  constructor(config = {}) {
    this.config = config;
    this.contextStrategies = CONTEXT_STRATEGIES;
  }

  /**
   * Build complete pattern matching prompt with context
   */
  buildPatternMatchingPrompt(transactions, patterns, context = {}) {
    const systemPrompt = SYSTEM_PROMPTS.PATTERN_IDENTIFICATION;
    const userMessage = MESSAGE_TEMPLATES.PATTERN_MATCHING.createMessage(
      transactions, 
      patterns, 
      context
    );

    // Add few-shot examples if requested
    const messages = [systemPrompt];
    
    if (context.includeFewShot) {
      FEW_SHOT_EXAMPLES.PATTERN_MATCHING.forEach(example => {
        messages.push({
          role: 'user',
          content: JSON.stringify(example.input)
        });
        messages.push({
          role: 'assistant',
          content: JSON.stringify(example.output)
        });
      });
    }

    messages.push(userMessage);
    return messages;
  }

  /**
   * Build GL account mapping prompt with context
   */
  buildGLMappingPrompt(transaction, glPatterns, context = {}) {
    const systemPrompt = SYSTEM_PROMPTS.GL_ACCOUNT_MAPPING;
    const userMessage = MESSAGE_TEMPLATES.GL_ACCOUNT_MAPPING.createMessage(
      transaction,
      glPatterns,
      context
    );

    const messages = [systemPrompt];

    if (context.includeFewShot) {
      FEW_SHOT_EXAMPLES.GL_ACCOUNT_MAPPING.forEach(example => {
        messages.push({
          role: 'user',
          content: JSON.stringify(example.input)
        });
        messages.push({
          role: 'assistant',
          content: JSON.stringify(example.output)
        });
      });
    }

    messages.push(userMessage);
    return messages;
  }

  /**
   * Build validation prompt for batch processing
   */
  buildValidationPrompt(suggestions, validationRules, context = {}) {
    const systemPrompt = SYSTEM_PROMPTS.VALIDATION_CONTROL;
    const userMessage = MESSAGE_TEMPLATES.BATCH_VALIDATION.createMessage(
      suggestions,
      validationRules,
      context
    );

    return [systemPrompt, userMessage];
  }

  /**
   * Build error handling prompt for ambiguous cases
   */
  buildErrorHandlingPrompt(errorType, transactionData, context = {}) {
    let systemPrompt;
    
    switch (errorType) {
      case 'AMBIGUOUS_PATTERN':
        systemPrompt = ERROR_HANDLING_PROMPTS.AMBIGUOUS_PATTERN;
        break;
      case 'LOW_CONFIDENCE':
        systemPrompt = ERROR_HANDLING_PROMPTS.LOW_CONFIDENCE;
        break;
      case 'DATA_QUALITY':
        systemPrompt = ERROR_HANDLING_PROMPTS.DATA_QUALITY;
        break;
      default:
        throw new Error(`Unknown error type: ${errorType}`);
    }

    const userMessage = {
      role: 'user',
      content: JSON.stringify({
        error_type: errorType,
        transaction_data: transactionData,
        context: context
      })
    };

    return [systemPrompt, userMessage];
  }

  /**
   * Inject customer and business context
   */
  injectContext(basePrompt, contextType, contextData) {
    const contextStrategy = this.contextStrategies[contextType];
    if (!contextStrategy) {
      throw new Error(`Unknown context type: ${contextType}`);
    }

    const context = contextStrategy(...contextData);
    
    // Add context to the user message
    const userMessage = basePrompt[basePrompt.length - 1];
    const messageContent = JSON.parse(userMessage.content);
    messageContent.context = { ...messageContent.context, ...context };
    userMessage.content = JSON.stringify(messageContent);

    return basePrompt;
  }
}

/**
 * Export helper functions for easy integration
 */

export function createPatternMatchingPrompt(transactions, patterns, options = {}) {
  const builder = new CashClearingPromptBuilder();
  return builder.buildPatternMatchingPrompt(transactions, patterns, options);
}

export function createGLMappingPrompt(transaction, glPatterns, options = {}) {
  const builder = new CashClearingPromptBuilder();
  return builder.buildGLMappingPrompt(transaction, glPatterns, options);
}

export function createValidationPrompt(suggestions, rules, options = {}) {
  const builder = new CashClearingPromptBuilder();
  return builder.buildValidationPrompt(suggestions, rules, options);
}

export function createBatchProcessingPrompt(transactionBatch, patterns, batchContext) {
  return BATCH_PROCESSING.BATCH_PATTERN_MATCHING.createBatchMessage(
    transactionBatch,
    patterns,
    batchContext
  );
}

/**
 * Confidence calculation utilities
 */

export const CONFIDENCE_CALCULATORS = {
  /**
   * Calculate overall confidence score based on multiple factors
   */
  calculateOverallConfidence: (scores) => {
    const weights = {
      pattern_match: 0.4,
      amount_validation: 0.2,
      description_analysis: 0.2,
      business_rules: 0.1,
      historical_precedent: 0.1
    };

    let totalScore = 0;
    let totalWeight = 0;

    Object.entries(weights).forEach(([factor, weight]) => {
      if (scores[factor] !== undefined) {
        totalScore += scores[factor] * weight;
        totalWeight += weight;
      }
    });

    return totalWeight > 0 ? totalScore / totalWeight : 0;
  },

  /**
   * Calculate pattern match confidence based on regex and context
   */
  calculatePatternConfidence: (matchResults) => {
    const factors = {
      regex_match_strength: matchResults.regex_score || 0,
      context_alignment: matchResults.context_score || 0,
      historical_frequency: matchResults.historical_score || 0,
      amount_appropriateness: matchResults.amount_score || 0
    };

    return CONFIDENCE_CALCULATORS.calculateOverallConfidence(factors);
  },

  /**
   * Calculate GL mapping confidence
   */
  calculateGLConfidence: (mappingData) => {
    const factors = {
      pattern_alignment: mappingData.pattern_score || 0,
      account_appropriateness: mappingData.account_score || 0,
      amount_validation: mappingData.amount_score || 0,
      business_rules: mappingData.rules_score || 0,
      risk_assessment: 1 - (mappingData.risk_score || 0)
    };

    return CONFIDENCE_CALCULATORS.calculateOverallConfidence(factors);
  }
};

export default {
  SYSTEM_PROMPTS,
  MESSAGE_TEMPLATES,
  FEW_SHOT_EXAMPLES,
  ERROR_HANDLING_PROMPTS,
  BATCH_PROCESSING,
  CONTEXT_STRATEGIES,
  OUTPUT_FORMATS,
  CashClearingPromptBuilder,
  CONFIDENCE_CALCULATORS,
  createPatternMatchingPrompt,
  createGLMappingPrompt,
  createValidationPrompt,
  createBatchProcessingPrompt
};