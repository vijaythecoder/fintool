/**
 * Comprehensive Example: Using the Cash Clearing Prompt Engineering System
 * 
 * This example demonstrates how to integrate and use the advanced prompt system
 * with the cash clearing workflow for real-world scenarios.
 */

import { 
  createPatternMatchingPrompt,
  createGLMappingPrompt, 
  createValidationPrompt,
  CashClearingPromptBuilder,
  CONFIDENCE_CALCULATORS
} from '../prompts/cashClearingPrompts.js';
import { 
  EnhancedCashClearingAI,
  createEnhancedCashClearingProcessor 
} from '../prompts/promptIntegration.js';
import { CashClearingProcessor } from '../processors/cashClearingProcessor.js';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

/**
 * EXAMPLE 1: Basic Pattern Matching with Enhanced Prompts
 */
export async function exampleBasicPatternMatching() {
  console.log('=== Example 1: Basic Pattern Matching ===');

  // Sample transaction data
  const transactions = [
    {
      transaction_id: "TXN_20240115_001",
      amount: 2500.00,
      reference_number: "INV789012",
      description: "INVOICE PAYMENT FOR CONSULTING SERVICES Q4 2023",
      transaction_date: "2024-01-15",
      account_id: "ACC_001",
      currency_code: "USD",
      source_system: "ERP_SYSTEM"
    },
    {
      transaction_id: "TXN_20240115_002", 
      amount: 15000.00,
      reference_number: "WIRE345678",
      description: "INTERNATIONAL WIRE TRANSFER TO VENDOR",
      transaction_date: "2024-01-15",
      account_id: "ACC_002",
      currency_code: "USD",
      source_system: "BANKING_SYSTEM"
    },
    {
      transaction_id: "TXN_20240115_003",
      amount: 750.50,
      reference_number: "CC890123",
      description: "CREDIT CARD PROCESSING FEES DECEMBER",
      transaction_date: "2024-01-15",
      account_id: "ACC_001", 
      currency_code: "USD",
      source_system: "PAYMENT_PROCESSOR"
    }
  ];

  // Available patterns for matching
  const patterns = [
    {
      pattern_id: "PTN_001",
      pattern_name: "Invoice Reference Match",
      pattern_type: "REFERENCE",
      pattern_regex: "INV[-_]?\\d{6,}",
      confidence_weight: 0.8,
      priority_order: 10,
      metadata: { description: "Matches standard invoice reference formats" }
    },
    {
      pattern_id: "PTN_002", 
      pattern_name: "Wire Transfer Pattern",
      pattern_type: "DESCRIPTION",
      pattern_regex: "WIRE.*TRANSFER",
      confidence_weight: 0.7,
      priority_order: 20,
      metadata: { description: "Identifies wire transfer transactions" }
    },
    {
      pattern_id: "PTN_003",
      pattern_name: "Credit Card Processing",
      pattern_type: "COMPOSITE", 
      pattern_regex: "CC.*PROCESSING|CREDIT.*CARD.*FEE",
      confidence_weight: 0.6,
      priority_order: 30,
      metadata: { description: "Credit card processing fees and charges" }
    }
  ];

  try {
    // Create pattern matching prompt
    const promptMessages = createPatternMatchingPrompt(transactions, patterns, {
      batchId: "BATCH_20240115_001",
      includeFewShot: true,
      qualityThreshold: 0.6,
      processingMode: "ENHANCED"
    });

    console.log('Generated prompt messages:', JSON.stringify(promptMessages, null, 2));

    // Simulate AI response (in real usage, this would call the AI model)
    const mockAIResponse = {
      transaction_results: {
        "TXN_20240115_001": {
          patterns_matched: [
            {
              pattern_id: "PTN_001",
              pattern_name: "Invoice Reference Match", 
              match_strength: 0.95,
              match_details: "Strong regex match on INV789012, description contains 'INVOICE PAYMENT'"
            }
          ],
          confidence_scores: {
            overall_confidence: 0.92,
            pattern_confidence: 0.95,
            description_confidence: 0.88
          },
          reasoning: "High confidence invoice payment based on reference number pattern and explicit description"
        },
        "TXN_20240115_002": {
          patterns_matched: [
            {
              pattern_id: "PTN_002",
              pattern_name: "Wire Transfer Pattern",
              match_strength: 0.87,
              match_details: "Clear wire transfer description, large amount typical for international transfers"
            }
          ],
          confidence_scores: {
            overall_confidence: 0.84,
            pattern_confidence: 0.87,
            description_confidence: 0.81
          },
          reasoning: "Strong wire transfer identification based on description and amount characteristics"
        },
        "TXN_20240115_003": {
          patterns_matched: [
            {
              pattern_id: "PTN_003", 
              pattern_name: "Credit Card Processing",
              match_strength: 0.78,
              match_details: "Matches credit card processing pattern, typical fee amount"
            }
          ],
          confidence_scores: {
            overall_confidence: 0.75,
            pattern_confidence: 0.78,
            description_confidence: 0.72
          },
          reasoning: "Good match for credit card processing fees based on description and amount range"
        }
      },
      batch_summary: {
        total_processed: 3,
        successful_matches: 3,
        failed_matches: 0,
        average_confidence: 0.84
      }
    };

    console.log('Pattern matching results:', JSON.stringify(mockAIResponse, null, 2));
    return mockAIResponse;

  } catch (error) {
    console.error('Pattern matching example failed:', error.message);
    throw error;
  }
}

/**
 * EXAMPLE 2: GL Account Mapping with Business Context
 */
export async function exampleGLAccountMapping() {
  console.log('\n=== Example 2: GL Account Mapping ===');

  const transaction = {
    transaction_id: "TXN_20240115_001", 
    amount: 2500.00,
    description: "INVOICE PAYMENT FOR CONSULTING SERVICES Q4 2023",
    matched_patterns: [
      {
        pattern_id: "PTN_001",
        pattern_name: "Invoice Reference Match",
        confidence: 0.95
      }
    ],
    confidence_scores: {
      overall_confidence: 0.92,
      pattern_confidence: 0.95
    },
    account_id: "ACC_001",
    currency_code: "USD", 
    transaction_date: "2024-01-15"
  };

  const glPatterns = [
    {
      gl_pattern_id: "GL_001",
      pattern_id: "PTN_001",
      gl_account_code: "1200",
      gl_account_name: "Accounts Receivable",
      debit_credit_indicator: "DR",
      account_category: "ASSET",
      business_unit: "CONSULTING",
      cost_center: "CC_001",
      mapping_confidence: 0.9,
      auto_approve_threshold: 0.95,
      requires_approval: false
    },
    {
      gl_pattern_id: "GL_002", 
      pattern_id: "PTN_001",
      gl_account_code: "4100",
      gl_account_name: "Service Revenue",
      debit_credit_indicator: "CR",
      account_category: "REVENUE",
      business_unit: "CONSULTING",
      cost_center: "CC_001",
      mapping_confidence: 0.85,
      auto_approve_threshold: 0.90,
      requires_approval: true
    }
  ];

  try {
    // Create GL mapping prompt with business context
    const promptMessages = createGLMappingPrompt(transaction, glPatterns, {
      batchId: "BATCH_20240115_001",
      approvalThreshold: 0.95,
      autoApproveEnabled: true,
      includeFewShot: true,
      businessContext: {
        fiscal_period: "Q1_2024",
        business_unit: "CONSULTING",
        transaction_volume: "NORMAL"
      }
    });

    console.log('GL mapping prompt created successfully');

    // Mock AI response for GL mapping
    const mockGLResponse = {
      gl_account_code: "1200",
      gl_account_name: "Accounts Receivable", 
      debit_credit_indicator: "DR",
      account_category: "ASSET",
      business_unit: "CONSULTING",
      confidence: 0.93,
      requires_approval: false,
      approval_level: "AUTO",
      mapping_reasoning: "Invoice payment indicates collection of accounts receivable. Debit to asset account increases receivables, consistent with revenue recognition. High pattern confidence supports auto-approval.",
      alternative_mappings: [
        {
          gl_account_code: "4100",
          gl_account_name: "Service Revenue",
          confidence: 0.85,
          reason: "Could represent direct revenue posting if invoice represents new service delivery"
        }
      ],
      validation_checks: {
        amount_reasonable: true,
        account_exists: true,
        debit_credit_valid: true,
        business_rules_met: true,
        compliance_check: true
      },
      risk_factors: [],
      risk_assessment: {
        risk_level: "LOW",
        risk_score: 0.1
      }
    };

    console.log('GL mapping result:', JSON.stringify(mockGLResponse, null, 2));
    return mockGLResponse;

  } catch (error) {
    console.error('GL mapping example failed:', error.message);
    throw error;
  }
}

/**
 * EXAMPLE 3: Batch Processing with Validation
 */
export async function exampleBatchProcessingWithValidation() {
  console.log('\n=== Example 3: Batch Processing with Validation ===');

  const suggestions = [
    {
      suggestion_id: "SUGG_001",
      transaction_id: "TXN_20240115_001",
      pattern_matched: "Invoice Reference Match",
      gl_account_code: "1200",
      gl_account_name: "Accounts Receivable",
      debit_credit_indicator: "DR",
      amount: 2500.00,
      confidence_score: 0.93,
      reasoning: {
        pattern_match_details: ["Strong invoice pattern match"],
        gl_mapping_logic: "Standard receivables posting",
        ai_analysis: "High confidence invoice collection"
      }
    },
    {
      suggestion_id: "SUGG_002",
      transaction_id: "TXN_20240115_002", 
      pattern_matched: "Wire Transfer Pattern",
      gl_account_code: "1010",
      gl_account_name: "Cash - Operating Account",
      debit_credit_indicator: "DR",
      amount: 15000.00,
      confidence_score: 0.84,
      reasoning: {
        pattern_match_details: ["Wire transfer description match"],
        gl_mapping_logic: "Cash receipt posting",
        ai_analysis: "International wire transfer receipt"
      }
    },
    {
      suggestion_id: "SUGG_003",
      transaction_id: "TXN_20240115_003",
      pattern_matched: "Credit Card Processing",
      gl_account_code: "5100", 
      gl_account_name: "Credit Card Processing Fees",
      debit_credit_indicator: "DR",
      amount: 750.50,
      confidence_score: 0.75,
      reasoning: {
        pattern_match_details: ["CC processing pattern match"],
        gl_mapping_logic: "Expense recognition",
        ai_analysis: "Monthly processing fees"
      }
    }
  ];

  const validationRules = {
    required_fields: ['suggestion_id', 'transaction_id', 'gl_account_code', 'amount'],
    amount_limits: { min: 0.01, max: 1000000 },
    confidence_thresholds: { 
      auto_approve: 0.95, 
      manual_review: 0.5,
      reject: 0.3
    },
    business_rules: {
      max_transaction_amount: 100000,
      require_dual_approval: true,
      blocked_patterns: ['SUSPICIOUS', 'FRAUD'],
      approved_gl_accounts: ['1010', '1200', '4100', '5100', '5200']
    },
    compliance_requirements: {
      sox_compliance: true,
      audit_trail_required: true,
      segregation_of_duties: true
    }
  };

  try {
    // Create validation prompt
    const promptMessages = createValidationPrompt(suggestions, validationRules, {
      batchId: "BATCH_20240115_001",
      validationLevel: "COMPREHENSIVE",
      autoApproveThreshold: 0.95,
      riskTolerance: "MEDIUM",
      complianceMode: "STRICT"
    });

    console.log('Validation prompt created for', suggestions.length, 'suggestions');

    // Mock validation response
    const mockValidationResponse = {
      validation_summary: {
        total_suggestions: 3,
        passed_count: 2,
        failed_count: 0,
        approval_required_count: 2,
        auto_approved_count: 1
      },
      suggestion_results: {
        "SUGG_001": {
          validation_status: "PASSED",
          validation_score: 0.95,
          issues: [],
          recommendation: "AUTO_APPROVE",
          approval_required: false,
          quality_assessment: {
            data_integrity: "EXCELLENT",
            accounting_validity: "EXCELLENT", 
            business_compliance: "EXCELLENT"
          }
        },
        "SUGG_002": {
          validation_status: "PASSED",
          validation_score: 0.88,
          issues: ["Large amount requires manager approval"],
          recommendation: "APPROVE_WITH_MANAGER",
          approval_required: true,
          approval_level: "MANAGER",
          quality_assessment: {
            data_integrity: "GOOD",
            accounting_validity: "EXCELLENT",
            business_compliance: "GOOD"
          }
        },
        "SUGG_003": {
          validation_status: "PASSED",
          validation_score: 0.82,
          issues: ["Confidence below auto-approve threshold"],
          recommendation: "APPROVE_WITH_ANALYST",
          approval_required: true,
          approval_level: "ANALYST",
          quality_assessment: {
            data_integrity: "GOOD",
            accounting_validity: "GOOD",
            business_compliance: "GOOD"
          }
        }
      },
      batch_recommendations: [
        "Review high-value transactions for dual approval",
        "Consider adjusting confidence thresholds for credit card fees",
        "Implement automated alerts for transactions above $10,000"
      ],
      risk_assessment: {
        overall_risk_level: "MEDIUM",
        risk_factors: ["One high-value transaction", "Mixed confidence levels"],
        mitigation_actions: ["Enhanced approval workflow", "Additional documentation"]
      }
    };

    console.log('Validation results:', JSON.stringify(mockValidationResponse, null, 2));
    return mockValidationResponse;

  } catch (error) {
    console.error('Batch validation example failed:', error.message);
    throw error;
  }
}

/**
 * EXAMPLE 4: Enhanced Processor Integration
 */
export async function exampleEnhancedProcessorIntegration() {
  console.log('\n=== Example 4: Enhanced Processor Integration ===');

  try {
    // Create base processor with default configuration
    const baseProcessor = new CashClearingProcessor({
      dataset: 'financial_data',
      model: 'gpt-4-turbo',
      batchSize: 50,
      approvalThreshold: 0.95,
      requireHumanApproval: true,
      enableAuditLog: true
    });

    // Enhance with advanced prompting capabilities
    const enhancedProcessor = createEnhancedCashClearingProcessor(baseProcessor, {
      model: 'gpt-4-turbo',
      temperature: 0.1,
      enableDetailedLogging: true,
      includeFewShotExamples: true
    });

    console.log('Enhanced processor created with advanced prompting capabilities');

    // Example workflow execution (simulation)
    const mockWorkflowOptions = {
      batchSize: 100,
      processingMode: 'ENHANCED',
      validationLevel: 'COMPREHENSIVE',
      businessContext: {
        fiscal_period: 'Q1_2024',
        processing_date: '2024-01-15',
        business_unit: 'CORPORATE'
      }
    };

    console.log('Would execute workflow with options:', mockWorkflowOptions);

    // Demonstrate AI processor capabilities
    const aiProcessor = enhancedProcessor.aiProcessor;
    
    // Example pattern matching with context
    const mockTransactions = [
      {
        transaction_id: "TXN_DEMO_001",
        amount: 5000.00,
        description: "MONTHLY SOFTWARE LICENSE PAYMENT",
        reference_number: "SLI240115001"
      }
    ];

    const mockPatterns = [
      {
        pattern_id: "PTN_SOFTWARE",
        pattern_name: "Software License Pattern",
        pattern_type: "DESCRIPTION",
        pattern_regex: "SOFTWARE.*LICENSE",
        confidence_weight: 0.8
      }
    ];

    console.log('Enhanced AI capabilities available:');
    console.log('- Advanced pattern matching with context injection');
    console.log('- Comprehensive GL account mapping with validation');
    console.log('- Batch processing with quality control');
    console.log('- Error handling for ambiguous cases');
    console.log('- Confidence scoring with multiple factors');

    return {
      processorType: 'EnhancedCashClearingProcessor',
      capabilities: [
        'Advanced Pattern Matching',
        'Comprehensive GL Mapping', 
        'Batch Validation',
        'Error Handling',
        'Context Injection',
        'Quality Assessment'
      ],
      integrationStatus: 'SUCCESS'
    };

  } catch (error) {
    console.error('Enhanced processor integration failed:', error.message);
    throw error;
  }
}

/**
 * EXAMPLE 5: Confidence Calculation and Scoring
 */
export async function exampleConfidenceCalculation() {
  console.log('\n=== Example 5: Confidence Calculation ===');

  // Example confidence factors for a transaction
  const confidenceFactors = {
    pattern_match: 0.92,        // Strong regex pattern match
    amount_validation: 0.85,    // Amount within expected range
    description_analysis: 0.88, // Clear descriptive content
    business_rules: 0.95,       // Complies with all business rules
    historical_precedent: 0.78  // Similar to past transactions
  };

  console.log('Input confidence factors:', confidenceFactors);

  // Calculate overall confidence
  const overallConfidence = CONFIDENCE_CALCULATORS.calculateOverallConfidence(confidenceFactors);
  console.log('Overall confidence score:', overallConfidence);

  // Pattern-specific confidence calculation
  const patternMatchResults = {
    regex_score: 0.95,
    context_score: 0.88,
    historical_score: 0.82,
    amount_score: 0.90
  };

  const patternConfidence = CONFIDENCE_CALCULATORS.calculatePatternConfidence(patternMatchResults);
  console.log('Pattern match confidence:', patternConfidence);

  // GL mapping confidence calculation
  const glMappingData = {
    pattern_score: 0.92,
    account_score: 0.90,
    amount_score: 0.85,
    rules_score: 0.95,
    risk_score: 0.15
  };

  const glConfidence = CONFIDENCE_CALCULATORS.calculateGLConfidence(glMappingData);
  console.log('GL mapping confidence:', glConfidence);

  return {
    overall_confidence: overallConfidence,
    pattern_confidence: patternConfidence,
    gl_confidence: glConfidence,
    recommendation: overallConfidence >= 0.95 ? 'AUTO_APPROVE' : 'MANUAL_REVIEW'
  };
}

/**
 * EXAMPLE 6: Error Handling and Edge Cases
 */
export async function exampleErrorHandlingEdgeCases() {
  console.log('\n=== Example 6: Error Handling and Edge Cases ===');

  const enhancedAI = new EnhancedCashClearingAI({
    model: 'gpt-4-turbo',
    enableDetailedLogging: true
  });

  // Case 1: Ambiguous transaction
  const ambiguousTransaction = {
    transaction_id: "TXN_AMBIGUOUS_001",
    amount: 1000.00,
    description: "PAYMENT TO VENDOR XYZ", // Could be multiple patterns
    reference_number: "PAY123456"
  };

  const availablePatterns = [
    { pattern_id: "PTN_INVOICE", pattern_name: "Invoice Payment" },
    { pattern_id: "PTN_EXPENSE", pattern_name: "Expense Payment" },
    { pattern_id: "PTN_REFUND", pattern_name: "Refund Payment" }
  ];

  try {
    console.log('Handling ambiguous transaction...');
    const ambiguityResult = await enhancedAI.handleAmbiguousTransaction(
      ambiguousTransaction,
      availablePatterns,
      {
        ambiguityIndicators: ['Multiple possible patterns', 'Generic description'],
        requiresHumanReview: true
      }
    );
    console.log('Ambiguity resolution:', ambiguityResult);
  } catch (error) {
    console.log('Ambiguity handling failed:', error.message);
  }

  // Case 2: Low confidence transaction
  const lowConfidenceTransaction = {
    transaction_id: "TXN_LOW_CONF_001",
    amount: 99999.99,
    description: "MISC PAYMENT",
    analysis: { confidence: 0.25 }
  };

  try {
    console.log('Handling low confidence transaction...');
    const lowConfResult = await enhancedAI.handleLowConfidenceTransaction(
      lowConfidenceTransaction,
      lowConfidenceTransaction.analysis,
      {
        confidenceFactors: {
          pattern_quality: 'LOW',
          amount_size: 'LARGE',
          description_clarity: 'POOR'
        }
      }
    );
    console.log('Low confidence resolution:', lowConfResult);
  } catch (error) {
    console.log('Low confidence handling failed:', error.message);
  }

  return {
    ambiguity_handling: 'DEMONSTRATED',
    low_confidence_handling: 'DEMONSTRATED',
    error_recovery: 'FUNCTIONAL'
  };
}

/**
 * MAIN DEMO FUNCTION
 */
export async function runComprehensivePromptDemo() {
  console.log('🚀 Starting Comprehensive Cash Clearing Prompt Engineering Demo\n');

  try {
    const results = {};

    // Run all examples
    results.patternMatching = await exampleBasicPatternMatching();
    results.glMapping = await exampleGLAccountMapping();
    results.batchValidation = await exampleBatchProcessingWithValidation();
    results.processorIntegration = await exampleEnhancedProcessorIntegration();
    results.confidenceCalculation = await exampleConfidenceCalculation();
    results.errorHandling = await exampleErrorHandlingEdgeCases();

    console.log('\n✅ All examples completed successfully!');
    console.log('\n📊 Demo Summary:');
    console.log('- Pattern Matching: Enhanced with context and few-shot examples');
    console.log('- GL Account Mapping: Comprehensive validation and risk assessment');
    console.log('- Batch Validation: Quality control and approval recommendations'); 
    console.log('- Processor Integration: Seamless enhancement of existing workflow');
    console.log('- Confidence Calculation: Multi-factor scoring system');
    console.log('- Error Handling: Robust handling of edge cases and ambiguity');

    return results;

  } catch (error) {
    console.error('❌ Demo failed:', error.message);
    throw error;
  }
}

// Export all examples for individual testing
export default {
  exampleBasicPatternMatching,
  exampleGLAccountMapping,
  exampleBatchProcessingWithValidation,
  exampleEnhancedProcessorIntegration,
  exampleConfidenceCalculation,
  exampleErrorHandlingEdgeCases,
  runComprehensivePromptDemo
};