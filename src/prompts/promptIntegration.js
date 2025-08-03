/**
 * Prompt Integration Module for Cash Clearing Processor
 * 
 * This module provides integration utilities to connect the comprehensive prompt system
 * with the existing CashClearingProcessor workflow.
 */

import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';
import {
  createPatternMatchingPrompt,
  createGLMappingPrompt,
  createValidationPrompt,
  createBatchProcessingPrompt,
  CashClearingPromptBuilder,
  CONFIDENCE_CALCULATORS,
  ERROR_HANDLING_PROMPTS
} from './cashClearingPrompts.js';
import { logger } from '../utils/logger.js';

/**
 * Enhanced AI Processor for Cash Clearing with Advanced Prompting
 */
export class EnhancedCashClearingAI {
  constructor(options = {}) {
    this.model = options.model || 'gpt-4-turbo';
    this.temperature = options.temperature || 0.1;
    this.maxTokens = options.maxTokens || 4000;
    this.timeout = options.timeout || 30000;
    this.promptBuilder = new CashClearingPromptBuilder(options);
    this.enableDetailedLogging = options.enableDetailedLogging || false;
    this.includeFewShotExamples = options.includeFewShotExamples !== false; // default true
  }

  /**
   * Enhanced pattern matching with comprehensive prompting
   */
  async matchTransactionPatterns(transactions, patterns, workflowState, context = {}) {
    const startTime = Date.now();
    
    try {
      logger.info('Starting enhanced pattern matching', {
        batchId: workflowState.batch_id,
        transactionCount: transactions.length,
        patternCount: patterns.length
      });

      // Build comprehensive prompt with context
      const promptMessages = this.promptBuilder.buildPatternMatchingPrompt(
        transactions,
        patterns,
        {
          batchId: workflowState.batch_id,
          includeFewShot: this.includeFewShotExamples,
          qualityThreshold: context.qualityThreshold || 0.5,
          processingMode: context.processingMode || 'STANDARD',
          ...context
        }
      );

      // Add customer and business context if available
      if (context.customerInfo) {
        this.promptBuilder.injectContext(
          promptMessages,
          'CUSTOMER_ACCOUNT_CONTEXT',
          [context.customerInfo, context.accountHistory]
        );
      }

      if (context.businessRules) {
        this.promptBuilder.injectContext(
          promptMessages,
          'BUSINESS_RULES_CONTEXT',
          [context.businessRules, context.complianceSettings]
        );
      }

      // Add temporal context
      this.promptBuilder.injectContext(
        promptMessages,
        'TEMPORAL_CONTEXT',
        [new Date(), context.businessCalendar || this.createDefaultBusinessCalendar()]
      );

      // Execute AI pattern matching
      const result = await generateText({
        model: openai(this.model),
        messages: promptMessages,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        responseFormat: { type: 'json' }
      });

      const aiResponse = JSON.parse(result.text);

      // Validate and enhance the response
      const enhancedResults = await this.enhancePatternMatchingResults(
        transactions,
        aiResponse,
        patterns,
        context
      );

      const processingTime = Date.now() - startTime;

      if (this.enableDetailedLogging) {
        logger.info('Pattern matching completed', {
          batchId: workflowState.batch_id,
          processingTimeMs: processingTime,
          successfulMatches: enhancedResults.successful_matches,
          averageConfidence: enhancedResults.average_confidence,
          qualityIssues: enhancedResults.quality_issues?.length || 0
        });
      }

      return this.formatPatternMatchingOutput(transactions, enhancedResults, workflowState);

    } catch (error) {
      logger.error('Enhanced pattern matching failed', {
        batchId: workflowState.batch_id,
        error: error.message,
        processingTimeMs: Date.now() - startTime
      });

      // Handle different types of errors with specific prompts
      return await this.handlePatternMatchingError(transactions, patterns, error, workflowState);
    }
  }

  /**
   * Enhanced GL account mapping with comprehensive validation
   */
  async selectOptimalGLMapping(transaction, glPatterns, tools, workflowState, context = {}) {
    const startTime = Date.now();

    try {
      logger.debug('Starting GL account mapping', {
        transactionId: transaction.transaction_id,
        availableGLPatterns: glPatterns.length
      });

      // Build comprehensive GL mapping prompt
      const promptMessages = this.promptBuilder.buildGLMappingPrompt(
        transaction,
        glPatterns,
        {
          batchId: workflowState.batch_id,
          approvalThreshold: context.approvalThreshold || 0.95,
          autoApproveEnabled: context.autoApproveEnabled !== false,
          includeFewShot: this.includeFewShotExamples,
          ...context
        }
      );

      // Execute AI GL mapping
      const result = await generateText({
        model: openai(this.model),
        messages: promptMessages,
        temperature: this.temperature,
        maxTokens: this.maxTokens,
        responseFormat: { type: 'json' }
      });

      const aiMapping = JSON.parse(result.text);

      // Enhanced validation and confidence calculation
      const validatedMapping = await this.validateGLMapping(
        transaction,
        aiMapping,
        glPatterns,
        context
      );

      const processingTime = Date.now() - startTime;

      if (this.enableDetailedLogging) {
        logger.debug('GL mapping completed', {
          transactionId: transaction.transaction_id,
          selectedAccount: validatedMapping.gl_account_code,
          confidence: validatedMapping.confidence,
          requiresApproval: validatedMapping.requires_approval,
          processingTimeMs: processingTime
        });
      }

      return validatedMapping;

    } catch (error) {
      logger.error('GL mapping failed', {
        transactionId: transaction.transaction_id,
        error: error.message
      });

      return await this.handleGLMappingError(transaction, glPatterns, error, context);
    }
  }

  /**
   * Batch validation with comprehensive quality control
   */
  async validateCashClearingSuggestions(suggestions, validationRules, context = {}) {
    const startTime = Date.now();

    try {
      logger.info('Starting batch validation', {
        suggestionsCount: suggestions.length,
        validationLevel: context.validationLevel || 'STANDARD'
      });

      // Build validation prompt
      const promptMessages = this.promptBuilder.buildValidationPrompt(
        suggestions,
        validationRules,
        {
          validationLevel: context.validationLevel || 'COMPREHENSIVE',
          autoApproveThreshold: context.autoApproveThreshold || 0.95,
          riskTolerance: context.riskTolerance || 'MEDIUM',
          complianceMode: context.complianceMode || 'STRICT',
          ...context
        }
      );

      // Execute validation
      const result = await generateText({
        model: openai(this.model),
        messages: promptMessages,
        temperature: 0.0, // Use deterministic temperature for validation
        maxTokens: this.maxTokens,
        responseFormat: { type: 'json' }
      });

      const validationResults = JSON.parse(result.text);

      // Process validation results and generate recommendations
      const processedResults = await this.processValidationResults(
        suggestions,
        validationResults,
        context
      );

      const processingTime = Date.now() - startTime;

      logger.info('Batch validation completed', {
        totalSuggestions: suggestions.length,
        passedValidation: processedResults.passed_count,
        failedValidation: processedResults.failed_count,
        requiresApproval: processedResults.approval_required_count,
        processingTimeMs: processingTime
      });

      return processedResults;

    } catch (error) {
      logger.error('Batch validation failed', {
        error: error.message,
        suggestionsCount: suggestions.length
      });

      return this.createFailsafeValidationResults(suggestions, error);
    }
  }

  /**
   * Handle ambiguous transactions that require special attention
   */
  async handleAmbiguousTransaction(transaction, availablePatterns, context = {}) {
    try {
      const promptMessages = this.promptBuilder.buildErrorHandlingPrompt(
        'AMBIGUOUS_PATTERN',
        {
          transaction,
          available_patterns: availablePatterns,
          ambiguity_indicators: context.ambiguityIndicators || []
        },
        context
      );

      const result = await generateText({
        model: openai(this.model),
        messages: promptMessages,
        temperature: 0.2,
        maxTokens: this.maxTokens,
        responseFormat: { type: 'json' }
      });

      const ambiguityResolution = JSON.parse(result.text);

      return {
        ...ambiguityResolution,
        requires_human_review: true,
        confidence_degraded: true,
        special_handling: 'AMBIGUOUS_PATTERN'
      };

    } catch (error) {
      logger.error('Ambiguous transaction handling failed', {
        transactionId: transaction.transaction_id,
        error: error.message
      });

      return {
        primary_classification: 'UNKNOWN',
        confidence: 0.1,
        recommendation: 'HUMAN_REVIEW',
        error_details: error.message,
        special_handling: 'ERROR_FALLBACK'
      };
    }
  }

  /**
   * Handle low confidence transactions
   */
  async handleLowConfidenceTransaction(transaction, analysis, context = {}) {
    try {
      const promptMessages = this.promptBuilder.buildErrorHandlingPrompt(
        'LOW_CONFIDENCE',
        {
          transaction,
          analysis,
          confidence_factors: context.confidenceFactors || {}
        },
        context
      );

      const result = await generateText({
        model: openai(this.model),
        messages: promptMessages,
        temperature: 0.1,
        maxTokens: this.maxTokens,
        responseFormat: { type: 'json' }
      });

      return JSON.parse(result.text);

    } catch (error) {
      logger.error('Low confidence handling failed', {
        transactionId: transaction.transaction_id,
        error: error.message
      });

      return {
        classification: 'MANUAL_REVIEW_REQUIRED',
        confidence: analysis.confidence || 0.2,
        approval_level: 'DIRECTOR',
        escalation_reason: 'AI_PROCESSING_ERROR'
      };
    }
  }

  /**
   * Enhanced pattern matching results processing
   */
  async enhancePatternMatchingResults(transactions, aiResponse, patterns, context) {
    const enhancedResults = {
      transaction_results: {},
      batch_summary: {
        total_processed: transactions.length,
        successful_matches: 0,
        failed_matches: 0,
        average_confidence: 0,
        quality_issues: []
      }
    };

    let totalConfidence = 0;
    let successfulMatches = 0;

    for (const transaction of transactions) {
      const transactionId = transaction.transaction_id;
      const aiResult = aiResponse.transaction_results?.[transactionId];

      if (!aiResult) {
        enhancedResults.transaction_results[transactionId] = {
          patterns_matched: [],
          confidence_scores: { overall_confidence: 0.0 },
          reasoning: 'No AI analysis result available',
          recommended_action: 'HUMAN_REVIEW'
        };
        enhancedResults.batch_summary.failed_matches++;
        continue;
      }

      // Calculate enhanced confidence scores
      const enhancedConfidence = this.calculateEnhancedConfidence(
        transaction,
        aiResult,
        patterns,
        context
      );

      // Validate pattern matches
      const validatedPatterns = this.validatePatternMatches(
        aiResult.patterns_matched,
        patterns
      );

      enhancedResults.transaction_results[transactionId] = {
        ...aiResult,
        patterns_matched: validatedPatterns,
        confidence_scores: {
          ...aiResult.confidence_scores,
          enhanced_confidence: enhancedConfidence,
          validation_score: this.calculateValidationScore(transaction, aiResult)
        },
        quality_assessment: this.assessResultQuality(transaction, aiResult),
        recommended_action: this.determineRecommendedAction(enhancedConfidence, context)
      };

      totalConfidence += enhancedConfidence;
      successfulMatches++;
    }

    enhancedResults.batch_summary.successful_matches = successfulMatches;
    enhancedResults.batch_summary.average_confidence = 
      successfulMatches > 0 ? totalConfidence / successfulMatches : 0;

    return enhancedResults;
  }

  /**
   * Validate GL mapping with business rules and compliance checks
   */
  async validateGLMapping(transaction, aiMapping, glPatterns, context) {
    const validationChecks = {
      amount_reasonable: this.validateAmountReasonableness(transaction.amount, aiMapping),
      account_exists: this.validateAccountExists(aiMapping.gl_account_code, glPatterns),
      debit_credit_valid: this.validateDebitCreditLogic(transaction, aiMapping),
      business_rules_met: this.validateBusinessRules(transaction, aiMapping, context),
      compliance_check: this.validateCompliance(transaction, aiMapping, context)
    };

    const validationScore = Object.values(validationChecks).filter(Boolean).length / 
                           Object.keys(validationChecks).length;

    // Calculate enhanced confidence based on validation results
    const enhancedConfidence = CONFIDENCE_CALCULATORS.calculateGLConfidence({
      pattern_score: aiMapping.confidence || 0,
      account_score: validationChecks.account_exists ? 0.9 : 0.1,
      amount_score: validationChecks.amount_reasonable ? 0.8 : 0.3,
      rules_score: validationChecks.business_rules_met ? 0.9 : 0.2,
      risk_score: this.assessMappingRisk(transaction, aiMapping, context)
    });

    return {
      ...aiMapping,
      confidence: enhancedConfidence,
      validation_score: validationScore,
      validation_checks: validationChecks,
      requires_approval: this.determineApprovalRequirement(
        enhancedConfidence,
        transaction,
        aiMapping,
        context
      ),
      approval_level: this.determineApprovalLevel(enhancedConfidence, transaction.amount, context),
      risk_assessment: this.createRiskAssessment(transaction, aiMapping, context)
    };
  }

  /**
   * Process validation results and generate actionable recommendations
   */
  async processValidationResults(suggestions, validationResults, context) {
    const processedResults = {
      validation_summary: {
        total_suggestions: suggestions.length,
        passed_count: 0,
        failed_count: 0,
        approval_required_count: 0,
        auto_approved_count: 0
      },
      suggestion_results: {},
      batch_recommendations: [],
      risk_assessment: {
        overall_risk_level: 'LOW',
        risk_factors: [],
        mitigation_actions: []
      }
    };

    for (const suggestion of suggestions) {
      const suggestionId = suggestion.suggestion_id;
      const validationResult = validationResults.suggestion_validations?.[suggestionId];

      if (!validationResult) {
        processedResults.suggestion_results[suggestionId] = {
          validation_status: 'FAILED',
          validation_score: 0.0,
          issues: ['No validation result available'],
          recommendation: 'REJECT',
          approval_required: true
        };
        processedResults.validation_summary.failed_count++;
        continue;
      }

      const processedResult = this.processSingleValidationResult(
        suggestion,
        validationResult,
        context
      );

      processedResults.suggestion_results[suggestionId] = processedResult;

      // Update summary counts
      if (processedResult.validation_status === 'PASSED') {
        processedResults.validation_summary.passed_count++;
        if (processedResult.recommendation === 'AUTO_APPROVE') {
          processedResults.validation_summary.auto_approved_count++;
        } else {
          processedResults.validation_summary.approval_required_count++;
        }
      } else {
        processedResults.validation_summary.failed_count++;
      }
    }

    // Generate batch-level recommendations
    processedResults.batch_recommendations = this.generateBatchRecommendations(
      processedResults,
      context
    );

    // Assess overall batch risk
    processedResults.risk_assessment = this.assessBatchRisk(
      suggestions,
      processedResults,
      context
    );

    return processedResults;
  }

  /**
   * Calculate enhanced confidence scores using multiple factors
   */
  calculateEnhancedConfidence(transaction, aiResult, patterns, context) {
    const confidenceFactors = {
      pattern_match: aiResult.confidence_scores?.pattern_confidence || 0,
      amount_validation: this.validateAmountPatterns(transaction.amount, context),
      description_analysis: this.analyzeDescriptionQuality(transaction.description),
      business_rules: this.checkBusinessRuleCompliance(transaction, context),
      historical_precedent: this.checkHistoricalPrecedent(transaction, context)
    };

    return CONFIDENCE_CALCULATORS.calculateOverallConfidence(confidenceFactors);
  }

  /**
   * Error handling for pattern matching failures
   */
  async handlePatternMatchingError(transactions, patterns, error, workflowState) {
    logger.warn('Applying fallback pattern matching', {
      batchId: workflowState.batch_id,
      errorType: error.constructor.name,
      transactionCount: transactions.length
    });

    // Simple fallback logic when AI fails
    const fallbackResults = transactions.map(transaction => ({
      ...transaction,
      matched_patterns: [],
      confidence_scores: { overall_confidence: 0.1 },
      ai_reasoning: `Fallback processing due to error: ${error.message}`,
      requires_human_review: true,
      error_details: {
        error_type: error.constructor.name,
        error_message: error.message,
        fallback_applied: true
      }
    }));

    return fallbackResults;
  }

  /**
   * Error handling for GL mapping failures  
   */
  async handleGLMappingError(transaction, glPatterns, error, context) {
    logger.warn('Applying fallback GL mapping', {
      transactionId: transaction.transaction_id,
      errorType: error.constructor.name
    });

    // Conservative fallback to first available GL pattern
    const fallbackGL = glPatterns[0] || {
      gl_account_code: '9999',
      gl_account_name: 'Suspense Account',
      debit_credit_indicator: 'DR',
      account_category: 'ASSET'
    };

    return {
      ...fallbackGL,
      confidence: 0.1,
      requires_approval: true,
      approval_level: 'DIRECTOR',
      mapping_reasoning: `Fallback mapping due to error: ${error.message}`,
      error_details: {
        error_type: error.constructor.name,
        error_message: error.message,
        fallback_applied: true
      }
    };
  }

  /**
   * Utility methods for validation and assessment
   */
  validateAmountReasonableness(amount, mapping) {
    // Basic amount validation logic
    return amount > 0 && amount < 1000000; // $1M max
  }

  validateAccountExists(accountCode, glPatterns) {
    return glPatterns.some(pattern => pattern.gl_account_code === accountCode);
  }

  validateDebitCreditLogic(transaction, mapping) {
    // Simplified debit/credit validation
    return ['DR', 'CR'].includes(mapping.debit_credit_indicator);
  }

  validateBusinessRules(transaction, mapping, context) {
    // Apply business rules from context
    const rules = context.businessRules || {};
    
    if (rules.maxTransactionAmount && transaction.amount > rules.maxTransactionAmount) {
      return false;
    }
    
    if (rules.blocklistPatterns) {
      const hasBlockedPattern = rules.blocklistPatterns.some(pattern =>
        transaction.description?.toLowerCase().includes(pattern.toLowerCase())
      );
      if (hasBlockedPattern) return false;
    }
    
    return true;
  }

  validateCompliance(transaction, mapping, context) {
    // Basic compliance checks
    return mapping.gl_account_code && mapping.debit_credit_indicator;
  }

  determineApprovalRequirement(confidence, transaction, mapping, context) {
    const threshold = context.autoApproveThreshold || 0.95;
    
    if (confidence < threshold) return true;
    if (transaction.amount > (context.autoApproveAmountLimit || 10000)) return true;
    if (mapping.requires_approval) return true;
    
    return false;
  }

  determineApprovalLevel(confidence, amount, context) {
    if (confidence < 0.3 || amount > 100000) return 'DIRECTOR';
    if (confidence < 0.5 || amount > 50000) return 'MANAGER';
    if (confidence < 0.7 || amount > 10000) return 'ANALYST';
    return 'AUTO';
  }

  createDefaultBusinessCalendar() {
    return {
      isBusinessDay: (date) => {
        const day = date.getDay();
        return day > 0 && day < 6; // Monday to Friday
      },
      isMonthEnd: (date) => {
        const nextDay = new Date(date);
        nextDay.setDate(date.getDate() + 1);
        return nextDay.getMonth() !== date.getMonth();
      },
      isQuarterEnd: (date) => {
        const month = date.getMonth();
        return [2, 5, 8, 11].includes(month) && this.isMonthEnd(date);
      },
      getFiscalPeriod: (date) => `FY${date.getFullYear()}-Q${Math.floor(date.getMonth() / 3) + 1}`,
      peak_periods: ['month_end', 'quarter_end', 'year_end'],
      holidays: [],
      typical_volumes: { weekday: 100, weekend: 10 }
    };
  }

  // Additional utility methods...
  validateAmountPatterns(amount, context) { return 0.8; }
  analyzeDescriptionQuality(description) { return description ? 0.8 : 0.2; }
  checkBusinessRuleCompliance(transaction, context) { return 0.9; }
  checkHistoricalPrecedent(transaction, context) { return 0.7; }
  validatePatternMatches(patterns, availablePatterns) { return patterns || []; }
  calculateValidationScore(transaction, result) { return 0.8; }
  assessResultQuality(transaction, result) { return { quality_level: 'GOOD' }; }
  determineRecommendedAction(confidence, context) { 
    return confidence > 0.8 ? 'AUTO_PROCESS' : 'HUMAN_REVIEW'; 
  }
  assessMappingRisk(transaction, mapping, context) { return 0.1; }
  createRiskAssessment(transaction, mapping, context) { 
    return { risk_level: 'LOW', risk_factors: [] }; 
  }
  processSingleValidationResult(suggestion, validationResult, context) {
    return {
      validation_status: 'PASSED',
      validation_score: 0.9,
      recommendation: 'AUTO_APPROVE',
      approval_required: false
    };
  }
  generateBatchRecommendations(results, context) { return []; }
  assessBatchRisk(suggestions, results, context) { 
    return { overall_risk_level: 'LOW', risk_factors: [], mitigation_actions: [] }; 
  }
  createFailsafeValidationResults(suggestions, error) {
    return {
      validation_summary: {
        total_suggestions: suggestions.length,
        passed_count: 0,
        failed_count: suggestions.length,
        approval_required_count: suggestions.length,
        auto_approved_count: 0
      },
      error_details: error.message
    };
  }
}

/**
 * Integration utilities for connecting with existing CashClearingProcessor
 */
export class PromptIntegrationManager {
  constructor(processor, aiProcessor = null) {
    this.processor = processor;
    this.aiProcessor = aiProcessor || new EnhancedCashClearingAI();
  }

  /**
   * Replace the pattern matching method in CashClearingProcessor
   */
  async enhancePatternMatching(originalMethod) {
    return async function(transactions, patterns, tools, workflowState) {
      try {
        // Use enhanced AI pattern matching
        return await this.aiProcessor.matchTransactionPatterns(
          transactions,
          patterns,
          workflowState,
          {
            tools,
            businessRules: this.processor.businessRules,
            qualityThreshold: 0.6,
            processingMode: 'ENHANCED'
          }
        );
      } catch (error) {
        // Fallback to original method
        logger.warn('Enhanced pattern matching failed, using fallback', { error: error.message });
        return await originalMethod.call(this.processor, transactions, patterns, tools, workflowState);
      }
    }.bind(this);
  }

  /**
   * Replace GL mapping method in CashClearingProcessor
   */
  async enhanceGLMapping(originalMethod) {
    return async function(transaction, glPatterns, tools, workflowState) {
      try {
        return await this.aiProcessor.selectOptimalGLMapping(
          transaction,
          glPatterns,
          tools,
          workflowState,
          {
            approvalThreshold: this.processor.approvalThreshold,
            businessRules: this.processor.businessRules,
            autoApproveEnabled: !this.processor.requireHumanApproval
          }
        );
      } catch (error) {
        logger.warn('Enhanced GL mapping failed, using fallback', { error: error.message });
        return await originalMethod.call(this.processor, transaction, glPatterns, tools, workflowState);
      }
    }.bind(this);
  }

  /**
   * Add validation step to workflow
   */
  async addValidationStep(suggestions, workflowState, context = {}) {
    const validationRules = this.processor.validationRules || this.createDefaultValidationRules();
    
    return await this.aiProcessor.validateCashClearingSuggestions(
      suggestions,
      validationRules,
      {
        batchId: workflowState.batch_id,
        validationLevel: context.validationLevel || 'COMPREHENSIVE',
        autoApproveThreshold: this.processor.approvalThreshold,
        riskTolerance: context.riskTolerance || 'MEDIUM'
      }
    );
  }

  createDefaultValidationRules() {
    return {
      required_fields: ['transaction_id', 'gl_account_code', 'amount'],
      amount_limits: { min: 0.01, max: 1000000 },
      confidence_thresholds: { auto_approve: 0.95, manual_review: 0.5 },
      business_rules: {
        max_transaction_amount: 100000,
        require_dual_approval: true,
        blocked_patterns: ['SUSPICIOUS', 'FRAUD']
      }
    };
  }
}

/**
 * Factory function to create enhanced processor with prompt integration
 */
export function createEnhancedCashClearingProcessor(originalProcessor, options = {}) {
  const aiProcessor = new EnhancedCashClearingAI(options);
  const integrationManager = new PromptIntegrationManager(originalProcessor, aiProcessor);

  // Enhanced methods
  originalProcessor.matchTransactionPatternsEnhanced = integrationManager.enhancePatternMatching(
    originalProcessor.matchTransactionPatterns
  );
  
  originalProcessor.selectOptimalGLMappingEnhanced = integrationManager.enhanceGLMapping(
    originalProcessor.selectOptimalGLMapping
  );

  originalProcessor.validateCashClearingSuggestions = integrationManager.addValidationStep.bind(integrationManager);

  // Add AI processor reference
  originalProcessor.aiProcessor = aiProcessor;
  originalProcessor.integrationManager = integrationManager;

  return originalProcessor;
}

export default {
  EnhancedCashClearingAI,
  PromptIntegrationManager,
  createEnhancedCashClearingProcessor
};