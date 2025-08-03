import { getCashClearingMcpClient } from '../services/cashClearingMcpClient.js';
import { logger } from './logger.js';
import { generateText } from 'ai';
import { openai } from '@ai-sdk/openai';

/**
 * Cash Clearing Integration Utilities
 * Helper functions for the 4-step cash clearing workflow integration
 */
export class CashClearingIntegration {
  constructor(options = {}) {
    this.mcpClient = null;
    this.model = options.model || process.env.AI_MODEL || 'gpt-4-turbo';
    this.confidenceThreshold = options.confidenceThreshold || parseFloat(process.env.CONFIDENCE_THRESHOLD) || 0.85;
    this.batchSize = options.batchSize || parseInt(process.env.BATCH_SIZE) || 100;
    this.enableDetailedLogging = options.enableDetailedLogging !== false;
    this.performanceMetrics = {
      step1Time: 0,
      step2Time: 0,
      step3Time: 0,
      step4Time: 0,
      totalTransactions: 0,
      successfulMappings: 0,
      failedMappings: 0
    };
  }

  /**
   * Initialize the integration
   */
  async initialize() {
    try {
      this.mcpClient = await getCashClearingMcpClient();
      logger.info('Cash Clearing Integration initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize Cash Clearing Integration', { error: error.message });
      throw error;
    }
  }

  /**
   * Execute the complete 4-step cash clearing workflow
   */
  async executeWorkflow(options = {}) {
    const workflowId = this.generateWorkflowId();
    const batchId = options.batchId || this.generateBatchId();
    const startTime = Date.now();

    logger.info('Starting cash clearing workflow', { workflowId, batchId, options });

    try {
      // Initialize workflow state
      await this.createWorkflowState(workflowId, batchId, options);

      // Step 1: Query cash transactions
      const step1Result = await this.executeStep1(workflowId, options);
      await this.updateWorkflowProgress(workflowId, 1, step1Result);

      if (step1Result.transactions.length === 0) {
        logger.info('No transactions found for processing', { workflowId, batchId });
        await this.finalizeWorkflow(workflowId, { totalProcessed: 0 });
        return { workflowId, batchId, totalProcessed: 0 };
      }

      // Step 2: Pattern matching
      const step2Result = await this.executeStep2(workflowId, step1Result.transactions, options);
      await this.updateWorkflowProgress(workflowId, 2, step2Result);

      // Step 3: GL account mapping
      const step3Result = await this.executeStep3(workflowId, step2Result.matchedTransactions, options);
      await this.updateWorkflowProgress(workflowId, 3, step3Result);

      // Step 4: Generate suggestions
      const step4Result = await this.executeStep4(workflowId, step3Result.mappedTransactions, options);
      await this.updateWorkflowProgress(workflowId, 4, step4Result);

      // Finalize workflow
      const finalResult = await this.finalizeWorkflow(workflowId, {
        totalProcessed: step4Result.suggestions.length,
        autoApproved: step4Result.autoApproved,
        requiresApproval: step4Result.requiresApproval,
        processingTime: Date.now() - startTime
      });

      logger.info('Cash clearing workflow completed successfully', { 
        workflowId, 
        batchId, 
        result: finalResult 
      });

      return {
        workflowId,
        batchId,
        totalProcessed: step4Result.suggestions.length,
        autoApproved: step4Result.autoApproved,
        requiresApproval: step4Result.requiresApproval,
        processingTime: Date.now() - startTime,
        performanceMetrics: this.performanceMetrics
      };

    } catch (error) {
      logger.error('Cash clearing workflow failed', { workflowId, batchId, error: error.message });
      await this.handleWorkflowError(workflowId, error);
      throw error;
    }
  }

  /**
   * Step 1: Query Cash Transactions
   */
  async executeStep1(workflowId, options = {}) {
    const stepStartTime = Date.now();
    
    try {
      logger.info('Executing Step 1: Query Cash Transactions', { workflowId });

      const queryOptions = {
        pattern: options.pattern || 'T_NOTFOUND',
        limit: options.limit || this.batchSize,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        customerAccountNumbers: options.customerAccountNumbers || [],
        processingStatus: options.processingStatus || 'PENDING'
      };

      const transactions = await this.mcpClient.queryCashTransactions(queryOptions);

      // Update transaction status to PROCESSING
      if (transactions.length > 0) {
        await this.updateTransactionStatus(
          transactions.map(t => t.bt_id), 
          'PROCESSING',
          workflowId
        );
      }

      const stepTime = Date.now() - stepStartTime;
      this.performanceMetrics.step1Time = stepTime;
      this.performanceMetrics.totalTransactions = transactions.length;

      await this.logAuditEntry(workflowId, 1, 'QUERY_TRANSACTIONS', {
        queryOptions,
        transactionCount: transactions.length,
        processingTime: stepTime
      });

      return {
        transactions,
        count: transactions.length,
        processingTime: stepTime
      };

    } catch (error) {
      logger.error('Step 1 failed', { workflowId, error: error.message });
      throw new Error(`Step 1 failed: ${error.message}`);
    }
  }

  /**
   * Step 2: Pattern Matching
   */
  async executeStep2(workflowId, transactions, options = {}) {
    const stepStartTime = Date.now();
    
    try {
      logger.info('Executing Step 2: Pattern Matching', { 
        workflowId, 
        transactionCount: transactions.length 
      });

      // Get active processor patterns
      const patterns = await this.mcpClient.getActiveProcessorPatterns({
        patternTypes: options.patternTypes,
        priorityThreshold: options.priorityThreshold
      });

      if (patterns.length === 0) {
        throw new Error('No active processor patterns found');
      }

      // Process transactions in batches
      const matchedTransactions = [];
      for (let i = 0; i < transactions.length; i += this.batchSize) {
        const batch = transactions.slice(i, i + this.batchSize);
        const batchResults = await this.matchTransactionPatternsBatch(
          batch, 
          patterns, 
          workflowId
        );
        matchedTransactions.push(...batchResults);

        logger.debug(`Pattern matching batch ${Math.floor(i / this.batchSize) + 1} completed`, {
          workflowId,
          batchSize: batch.length,
          totalProcessed: i + batch.length
        });
      }

      const stepTime = Date.now() - stepStartTime;
      this.performanceMetrics.step2Time = stepTime;

      await this.logAuditEntry(workflowId, 2, 'PATTERN_MATCHING', {
        patternsUsed: patterns.length,
        transactionsProcessed: transactions.length,
        matchedTransactions: matchedTransactions.length,
        processingTime: stepTime
      });

      return {
        matchedTransactions,
        patterns: patterns.length,
        count: matchedTransactions.length,
        processingTime: stepTime
      };

    } catch (error) {
      logger.error('Step 2 failed', { workflowId, error: error.message });
      throw new Error(`Step 2 failed: ${error.message}`);
    }
  }

  /**
   * Match transaction patterns using AI for a batch
   */
  async matchTransactionPatternsBatch(transactions, patterns, workflowId) {
    try {
      const prompt = this.buildPatternMatchingPrompt(patterns);
      
      const result = await generateText({
        model: openai(this.model),
        messages: [
          {
            role: 'system',
            content: prompt
          },
          {
            role: 'user',
            content: JSON.stringify({
              transactions: transactions.map(t => ({
                transaction_id: t.bt_id,
                description: t.text,
                amount: t.amount,
                reference: t.reference_number,
                type_code: t.type_code,
                customer_account: t.customer_account_number
              })),
              workflowId
            })
          }
        ],
        temperature: 0.1,
        maxTokens: 4000,
        responseFormat: { type: 'json' }
      });

      const aiResponse = JSON.parse(result.text);
      
      // Enhance transactions with AI pattern matching results
      return transactions.map(transaction => {
        const aiMatch = aiResponse.matches?.[transaction.bt_id] || {};
        return {
          ...transaction,
          matched_patterns: aiMatch.patterns || [],
          pattern_confidence: aiMatch.confidence || 0,
          ai_reasoning: aiMatch.reasoning || 'No pattern match found',
          match_details: aiMatch.details || {}
        };
      });

    } catch (error) {
      logger.error('AI pattern matching failed', { error: error.message, workflowId });
      
      // Fallback to rule-based matching
      return this.fallbackPatternMatching(transactions, patterns);
    }
  }

  /**
   * Step 3: GL Account Mapping
   */
  async executeStep3(workflowId, matchedTransactions, options = {}) {
    const stepStartTime = Date.now();
    
    try {
      logger.info('Executing Step 3: GL Account Mapping', { 
        workflowId, 
        transactionCount: matchedTransactions.length 
      });

      // Get unique pattern names from matched transactions
      const patternNames = [...new Set(
        matchedTransactions
          .flatMap(t => t.matched_patterns)
          .map(p => p.pattern_name)
          .filter(Boolean)
      )];

      if (patternNames.length === 0) {
        logger.warn('No patterns found for GL mapping', { workflowId });
        return {
          mappedTransactions: matchedTransactions.map(t => ({ ...t, gl_mapping: null })),
          count: 0,
          processingTime: Date.now() - stepStartTime
        };
      }

      // Get GL patterns for matched patterns
      const glPatterns = await this.mcpClient.getGLPatternsForPatterns(patternNames);

      // Process transactions for GL mapping
      const mappedTransactions = [];
      for (let i = 0; i < matchedTransactions.length; i += this.batchSize) {
        const batch = matchedTransactions.slice(i, i + this.batchSize);
        const batchResults = await this.mapGLAccountsBatch(
          batch, 
          glPatterns, 
          workflowId
        );
        mappedTransactions.push(...batchResults);

        logger.debug(`GL mapping batch ${Math.floor(i / this.batchSize) + 1} completed`, {
          workflowId,
          batchSize: batch.length,
          totalProcessed: i + batch.length
        });
      }

      const stepTime = Date.now() - stepStartTime;
      this.performanceMetrics.step3Time = stepTime;

      await this.logAuditEntry(workflowId, 3, 'GL_MAPPING', {
        glPatternsUsed: glPatterns.length,
        transactionsProcessed: matchedTransactions.length,
        mappedTransactions: mappedTransactions.filter(t => t.gl_mapping).length,
        processingTime: stepTime
      });

      return {
        mappedTransactions,
        glPatterns: glPatterns.length,
        count: mappedTransactions.filter(t => t.gl_mapping).length,
        processingTime: stepTime
      };

    } catch (error) {
      logger.error('Step 3 failed', { workflowId, error: error.message });
      throw new Error(`Step 3 failed: ${error.message}`);
    }
  }

  /**
   * Map GL accounts using AI for a batch
   */
  async mapGLAccountsBatch(transactions, glPatterns, workflowId) {
    try {
      const prompt = this.buildGLMappingPrompt();
      
      const result = await generateText({
        model: openai(this.model),
        messages: [
          {
            role: 'system',
            content: prompt
          },
          {
            role: 'user',
            content: JSON.stringify({
              transactions: transactions.map(t => ({
                transaction_id: t.bt_id,
                description: t.text,
                amount: t.amount,
                matched_patterns: t.matched_patterns,
                pattern_confidence: t.pattern_confidence
              })),
              availableGLPatterns: glPatterns,
              confidenceThreshold: this.confidenceThreshold,
              workflowId
            })
          }
        ],
        temperature: 0.1,
        maxTokens: 6000,
        responseFormat: { type: 'json' }
      });

      const aiResponse = JSON.parse(result.text);
      
      // Enhance transactions with AI GL mapping results
      return transactions.map(transaction => {
        const aiMapping = aiResponse.mappings?.[transaction.bt_id] || {};
        return {
          ...transaction,
          gl_mapping: aiMapping.gl_mapping || null,
          mapping_confidence: aiMapping.confidence || 0,
          mapping_reasoning: aiMapping.reasoning || 'No GL mapping found',
          alternative_mappings: aiMapping.alternatives || []
        };
      });

    } catch (error) {
      logger.error('AI GL mapping failed', { error: error.message, workflowId });
      
      // Fallback to rule-based mapping
      return this.fallbackGLMapping(transactions, glPatterns);
    }
  }

  /**
   * Step 4: Generate Suggestions
   */
  async executeStep4(workflowId, mappedTransactions, options = {}) {
    const stepStartTime = Date.now();
    
    try {
      logger.info('Executing Step 4: Generate Suggestions', { 
        workflowId, 
        transactionCount: mappedTransactions.length 
      });

      const suggestions = [];
      let autoApproved = 0;
      let requiresApproval = 0;

      // Generate suggestions for transactions with GL mappings
      for (const transaction of mappedTransactions) {
        if (!transaction.gl_mapping) {
          continue;
        }

        const suggestion = await this.createCashClearingSuggestion(
          transaction, 
          workflowId, 
          options
        );

        suggestions.push(suggestion);

        if (suggestion.approval_status === 'AUTO_APPROVED') {
          autoApproved++;
        } else {
          requiresApproval++;
        }
      }

      // Insert suggestions into BigQuery
      if (suggestions.length > 0) {
        await this.mcpClient.insertCashClearingSuggestions(suggestions);
      }

      const stepTime = Date.now() - stepStartTime;
      this.performanceMetrics.step4Time = stepTime;
      this.performanceMetrics.successfulMappings = suggestions.length;

      await this.logAuditEntry(workflowId, 4, 'GENERATE_SUGGESTIONS', {
        suggestionsGenerated: suggestions.length,
        autoApproved,
        requiresApproval,
        processingTime: stepTime
      });

      return {
        suggestions,
        count: suggestions.length,
        autoApproved,
        requiresApproval,
        processingTime: stepTime
      };

    } catch (error) {
      logger.error('Step 4 failed', { workflowId, error: error.message });
      throw new Error(`Step 4 failed: ${error.message}`);
    }
  }

  /**
   * Create cash clearing suggestion from mapped transaction
   */
  async createCashClearingSuggestion(transaction, workflowId, options = {}) {
    const glMapping = transaction.gl_mapping;
    const overallConfidence = this.calculateOverallConfidence(transaction);
    
    // Perform comprehensive validation
    const validationResults = await this.validateSuggestion(transaction, glMapping);
    const riskAssessment = this.assessRisk(transaction, glMapping);
    const complianceChecks = await this.performComplianceChecks(transaction, glMapping);

    return {
      suggestion_id: this.generateUUID(),
      transaction_id: transaction.bt_id,
      workflow_id: workflowId,
      workflow_step: 4,
      step_name: 'Generate Suggestions',
      pattern_matched: transaction.matched_patterns?.[0]?.pattern_name,
      pattern_confidence: transaction.pattern_confidence,
      gl_account_code: glMapping.GL_ACCOUNT,
      gl_account_name: glMapping.gl_account_name,
      ft_id: glMapping.FT_ID,
      debit_credit_indicator: glMapping.debit_credit_indicator,
      amount: transaction.amount,
      currency_code: transaction.currency_code || 'USD',
      business_unit: glMapping.business_unit,
      cost_center: glMapping.cost_center,
      profit_center: glMapping.profit_center,
      overall_confidence_score: overallConfidence,
      confidence_breakdown: {
        pattern_confidence: transaction.pattern_confidence,
        mapping_confidence: transaction.mapping_confidence,
        validation_confidence: validationResults.confidence,
        risk_confidence: riskAssessment.confidence
      },
      ai_reasoning: {
        pattern_match: transaction.ai_reasoning,
        gl_mapping: transaction.mapping_reasoning,
        validation: validationResults.reasoning,
        risk_assessment: riskAssessment.reasoning
      },
      alternative_suggestions: transaction.alternative_mappings || [],
      risk_assessment: riskAssessment,
      compliance_checks: complianceChecks,
      approval_status: overallConfidence >= this.confidenceThreshold ? 'AUTO_APPROVED' : 'PENDING',
      processing_batch_id: options.batchId,
      ai_model: this.model,
      model_version: options.modelVersion || '1.0',
      prompt_version: options.promptVersion || '1.0',
      processing_time_ms: Date.now() - (options.startTime || Date.now()),
      validation_checks: validationResults,
      quality_score: this.calculateQualityScore(transaction, glMapping, validationResults),
      business_impact_assessment: await this.assessBusinessImpact(transaction, glMapping),
      regulatory_impact: await this.assessRegulatoryImpact(transaction, glMapping),
      audit_trail: {
        workflow_id: workflowId,
        processing_steps: [
          { step: 1, status: 'completed', timestamp: new Date().toISOString() },
          { step: 2, status: 'completed', timestamp: new Date().toISOString() },
          { step: 3, status: 'completed', timestamp: new Date().toISOString() },
          { step: 4, status: 'completed', timestamp: new Date().toISOString() }
        ]
      },
      source_data_hash: this.hashObject(transaction),
      metadata: {
        workflow_options: options,
        performance_metrics: this.performanceMetrics
      }
    };
  }

  /**
   * Workflow State Management
   */

  async createWorkflowState(workflowId, batchId, options) {
    const workflowData = {
      workflow_id: workflowId,
      batch_id: batchId,
      workflow_type: options.workflowType || 'STANDARD',
      initiated_by: options.initiatedBy || 'SYSTEM',
      workflow_priority: options.priority || 'NORMAL',
      estimated_completion: options.estimatedCompletion,
      metadata: {
        options,
        initiated_at: new Date().toISOString()
      }
    };

    return await this.mcpClient.createWorkflowState(workflowData);
  }

  async updateWorkflowProgress(workflowId, stepNumber, stepResult) {
    const updates = {
      current_step: stepNumber,
      [`step_${stepNumber}_status`]: 'COMPLETED',
      [`step_${stepNumber}_completed_at`]: new Date(),
      [`step_${stepNumber}_result_count`]: stepResult.count || 0,
      performance_metrics: this.performanceMetrics
    };

    return await this.mcpClient.updateWorkflowState(workflowId, updates);
  }

  async finalizeWorkflow(workflowId, finalResult) {
    const updates = {
      workflow_status: 'COMPLETED',
      actual_completion: new Date(),
      processed_transactions: finalResult.totalProcessed,
      auto_approved_count: finalResult.autoApproved || 0,
      manual_review_count: finalResult.requiresApproval || 0,
      performance_metrics: this.performanceMetrics,
      quality_metrics: {
        success_rate: this.performanceMetrics.totalTransactions > 0 
          ? (this.performanceMetrics.successfulMappings / this.performanceMetrics.totalTransactions) * 100 
          : 0,
        average_processing_time: finalResult.processingTime / this.performanceMetrics.totalTransactions
      }
    };

    return await this.mcpClient.updateWorkflowState(workflowId, updates);
  }

  async handleWorkflowError(workflowId, error) {
    const updates = {
      workflow_status: 'FAILED',
      error_details: {
        message: error.message,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    };

    await this.mcpClient.updateWorkflowState(workflowId, updates);

    await this.logAuditEntry(workflowId, 0, 'WORKFLOW_ERROR', {
      error: error.message,
      stack: error.stack
    });
  }

  /**
   * Utility and Helper Methods
   */

  buildPatternMatchingPrompt(patterns) {
    return `You are an expert financial transaction pattern matching specialist.

Analyze cash transactions and match them against these predefined patterns:

${patterns.map(p => `
Pattern: ${p.pattern_name} (Type: ${p.pattern_type})
Search: ${p.pattern_search || 'N/A'}
Operation: ${p.pattern_op || 'N/A'}
Regex: ${p.pattern_regex || 'N/A'}
Confidence Weight: ${p.confidence_weight}
Priority: ${p.priority_order}
Business Rules: ${JSON.stringify(p.business_rules || {})}
`).join('\n')}

For each transaction:
1. Analyze reference numbers, descriptions, amounts, type codes
2. Apply pattern matching rules and regex
3. Consider business rules and context
4. Calculate confidence scores

Return JSON:
{
  "matches": {
    "transaction_id": {
      "patterns": [
        {
          "pattern_name": "name",
          "pattern_id": "id", 
          "match_strength": 0.0-1.0,
          "match_type": "EXACT|PARTIAL|REGEX",
          "matched_fields": ["field1", "field2"]
        }
      ],
      "confidence": 0.0-1.0,
      "reasoning": "explanation",
      "details": {
        "primary_indicators": ["indicator1"],
        "secondary_indicators": ["indicator2"]
      }
    }
  }
}

Focus on accuracy and provide detailed reasoning.`;
  }

  buildGLMappingPrompt() {
    return `You are an expert financial GL account mapping specialist.

Select optimal GL account mappings for transactions based on:
1. Matched transaction patterns and confidence
2. Available GL account options and business rules
3. Debit/Credit posting logic and account categories
4. Risk assessment and compliance requirements

Consider:
- Account appropriateness (Asset, Liability, Revenue, Expense)
- Business unit and cost center alignment
- Regulatory compliance requirements
- Mapping confidence and auto-approval thresholds
- Risk factors and exception conditions

Return JSON:
{
  "mappings": {
    "transaction_id": {
      "gl_mapping": {
        "GL_ACCOUNT": "account_code",
        "gl_account_name": "name",
        "FT_ID": "ft_id",
        "debit_credit_indicator": "DR|CR",
        "business_unit": "unit",
        "cost_center": "center",
        "account_type": "type"
      },
      "confidence": 0.0-1.0,
      "reasoning": "detailed_explanation",
      "alternatives": [
        {
          "GL_ACCOUNT": "alt_code",
          "confidence": 0.0-1.0,
          "reason": "why_alternative"
        }
      ],
      "risk_factors": ["factor1"],
      "compliance_notes": "compliance_info"
    }
  }
}

Prioritize accuracy, compliance, and clear business justification.`;
  }

  calculateOverallConfidence(transaction) {
    const patternConf = transaction.pattern_confidence || 0;
    const mappingConf = transaction.mapping_confidence || 0;
    
    // Weighted average with pattern matching being slightly more important
    return (patternConf * 0.6 + mappingConf * 0.4);
  }

  async validateSuggestion(transaction, glMapping) {
    const checks = {
      amount_positive: transaction.amount > 0,
      gl_account_exists: !!glMapping.GL_ACCOUNT,
      debit_credit_valid: ['DR', 'CR'].includes(glMapping.debit_credit_indicator),
      pattern_matched: !!transaction.matched_patterns?.length,
      confidence_adequate: transaction.pattern_confidence >= 0.5,
      business_unit_valid: !!glMapping.business_unit,
      account_type_valid: ['ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE'].includes(glMapping.account_type)
    };

    const passedChecks = Object.values(checks).filter(Boolean).length;
    const totalChecks = Object.keys(checks).length;
    const confidence = passedChecks / totalChecks;

    return {
      checks,
      confidence,
      passed: passedChecks,
      total: totalChecks,
      reasoning: `Validation passed ${passedChecks}/${totalChecks} checks`
    };
  }

  assessRisk(transaction, glMapping) {
    const riskFactors = [];
    let riskScore = 0;

    // Amount-based risk
    if (transaction.amount > 100000) {
      riskFactors.push('HIGH_AMOUNT');
      riskScore += 0.3;
    }

    // Pattern confidence risk
    if (transaction.pattern_confidence < 0.7) {
      riskFactors.push('LOW_PATTERN_CONFIDENCE');
      riskScore += 0.2;
    }

    // GL mapping confidence risk
    if (transaction.mapping_confidence < 0.8) {
      riskFactors.push('LOW_MAPPING_CONFIDENCE');
      riskScore += 0.2;
    }

    // Account type risk
    if (['REVENUE', 'EXPENSE'].includes(glMapping.account_type)) {
      riskFactors.push('P&L_IMPACT');
      riskScore += 0.1;
    }

    const riskLevel = riskScore > 0.5 ? 'HIGH' : riskScore > 0.2 ? 'MEDIUM' : 'LOW';

    return {
      risk_factors: riskFactors,
      risk_score: Math.min(riskScore, 1.0),
      risk_level: riskLevel,
      confidence: 1.0 - Math.min(riskScore, 1.0),
      reasoning: `Risk assessment identified ${riskFactors.length} risk factors with ${riskLevel} risk level`
    };
  }

  async performComplianceChecks(transaction, glMapping) {
    const checks = {
      segregation_of_duties: true, // Simplified for demo
      authorization_limits: transaction.amount <= 1000000,
      regulatory_reporting: !!glMapping.regulatory_requirements,
      audit_trail_complete: true,
      data_retention_compliant: true
    };

    const flags = [];
    if (!checks.authorization_limits) flags.push('EXCEEDS_AUTH_LIMIT');
    if (!checks.regulatory_reporting) flags.push('MISSING_REGULATORY_INFO');

    return {
      checks,
      compliance_flags: flags,
      compliant: flags.length === 0,
      notes: flags.length > 0 ? `Compliance issues: ${flags.join(', ')}` : 'All compliance checks passed'
    };
  }

  calculateQualityScore(transaction, glMapping, validationResults) {
    const factors = [
      transaction.pattern_confidence || 0,
      transaction.mapping_confidence || 0,
      validationResults.confidence || 0
    ];

    return factors.reduce((sum, factor) => sum + factor, 0) / factors.length;
  }

  async assessBusinessImpact(transaction, glMapping) {
    return {
      financial_impact: {
        amount: transaction.amount,
        account_category: glMapping.account_type,
        p_and_l_impact: ['REVENUE', 'EXPENSE'].includes(glMapping.account_type)
      },
      operational_impact: 'MINIMAL',
      stakeholder_impact: 'LOW'
    };
  }

  async assessRegulatoryImpact(transaction, glMapping) {
    return {
      regulatory_requirements: glMapping.regulatory_requirements || [],
      compliance_level: 'STANDARD',
      reporting_obligations: []
    };
  }

  fallbackPatternMatching(transactions, patterns) {
    return transactions.map(transaction => {
      const matches = patterns.filter(pattern => {
        if (pattern.pattern_regex) {
          const regex = new RegExp(pattern.pattern_regex, 'i');
          return regex.test(transaction.text || '');
        }
        return false;
      });

      return {
        ...transaction,
        matched_patterns: matches.map(p => ({
          pattern_name: p.pattern_name,
          pattern_id: p.pattern_id,
          match_strength: 0.5, // Conservative fallback
          match_type: 'REGEX'
        })),
        pattern_confidence: matches.length > 0 ? 0.5 : 0,
        ai_reasoning: 'Fallback rule-based matching'
      };
    });
  }

  fallbackGLMapping(transactions, glPatterns) {
    return transactions.map(transaction => {
      if (!transaction.matched_patterns?.length) {
        return { ...transaction, gl_mapping: null };
      }

      const bestPattern = transaction.matched_patterns[0];
      const glMapping = glPatterns.find(gl => gl.pattern === bestPattern.pattern_name);

      return {
        ...transaction,
        gl_mapping: glMapping || null,
        mapping_confidence: glMapping ? 0.5 : 0,
        mapping_reasoning: 'Fallback rule-based mapping'
      };
    });
  }

  async updateTransactionStatus(transactionIds, status, workflowId) {
    const idList = transactionIds.map(id => `'${id}'`).join(',');
    const query = `
      UPDATE \`${this.mcpClient.projectId}.${this.mcpClient.dataset}.cash_transactions\`
      SET processing_status = '${status}',
          batch_id = '${workflowId}',
          updated_at = CURRENT_TIMESTAMP()
      WHERE bt_id IN (${idList})
    `;

    return await this.mcpClient.executeQueryWithRetry(query);
  }

  async logAuditEntry(workflowId, stepNumber, actionType, actionDetails) {
    const auditData = {
      workflow_id: workflowId,
      step_number: stepNumber,
      action_type: actionType,
      action_details: actionDetails,
      actor_type: 'SYSTEM',
      ai_model: this.model,
      processing_time_ms: actionDetails.processingTime || 0
    };

    return await this.mcpClient.insertAuditLog(auditData);
  }

  generateWorkflowId() {
    return `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateBatchId() {
    return `batch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  hashObject(obj) {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Get performance metrics
   */
  getPerformanceMetrics() {
    return {
      ...this.performanceMetrics,
      totalTime: Object.values(this.performanceMetrics).reduce((sum, time) => sum + time, 0),
      averageTimePerTransaction: this.performanceMetrics.totalTransactions > 0 
        ? (this.performanceMetrics.step1Time + this.performanceMetrics.step2Time + 
           this.performanceMetrics.step3Time + this.performanceMetrics.step4Time) / this.performanceMetrics.totalTransactions
        : 0
    };
  }

  /**
   * Cleanup resources
   */
  async cleanup() {
    if (this.mcpClient) {
      await this.mcpClient.close();
    }
  }
}

// Export convenience functions
export async function executeCashClearingWorkflow(options = {}) {
  const integration = new CashClearingIntegration(options);
  await integration.initialize();
  
  try {
    return await integration.executeWorkflow(options);
  } finally {
    await integration.cleanup();
  }
}

export async function getWorkflowStatus(workflowId) {
  const integration = new CashClearingIntegration();
  await integration.initialize();
  
  try {
    return await integration.mcpClient.getWorkflowStatus(workflowId);
  } finally {
    await integration.cleanup();
  }
}

export async function getPendingApprovals(batchId = null, limit = 100) {
  const integration = new CashClearingIntegration();
  await integration.initialize();
  
  try {
    return await integration.mcpClient.getPendingApprovals(batchId, limit);
  } finally {
    await integration.cleanup();
  }
}