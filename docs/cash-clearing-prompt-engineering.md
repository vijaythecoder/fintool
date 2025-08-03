# Cash Clearing Prompt Engineering System

## Overview

The Cash Clearing Prompt Engineering System provides a comprehensive solution for enhancing the 4-step cash clearing workflow with advanced AI-driven pattern matching, GL account mapping, and validation capabilities.

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                  Cash Clearing Workflow                     │
├─────────────────────────────────────────────────────────────┤
│ Step 1: Query cash_transactions (T_NOTFOUND)               │
│ Step 2: Pattern matching using cash_processor_patterns     │
│ Step 3: GL account lookup from cash_gl_patterns           │
│ Step 4: Insert results to ai_cash_clearing_suggestions     │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│              Enhanced Prompt Engineering Layer              │
├─────────────────────────────────────────────────────────────┤
│ • System Prompts (Pattern ID, GL Mapping, Validation)     │
│ • User Message Templates                                   │
│ • Few-Shot Examples                                        │
│ • Context Injection Strategies                            │
│ • Error Handling Prompts                                  │
│ • Batch Processing Templates                              │
│ • Output Format Specifications                            │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                 AI Model Integration                        │
├─────────────────────────────────────────────────────────────┤
│ • GPT-4 Turbo for complex reasoning                       │
│ • Structured JSON responses                               │
│ • Confidence scoring                                      │
│ • Validation and quality control                         │
└─────────────────────────────────────────────────────────────┘
```

## Core Components

### 1. System Prompts (`SYSTEM_PROMPTS`)

#### Pattern Identification Prompt
Specializes in analyzing transaction text to identify patterns like SETTLEMENT, TOPUP, FOREX, etc.

**Features:**
- Classification types: SETTLEMENT, TOPUP, FOREX, WIRE_TRANSFER, ACH_PAYMENT, etc.
- Confidence scoring guidelines (0.9-1.0: Highly confident, 0.7-0.89: Confident, etc.)
- Multi-field pattern analysis (reference, description, amount, temporal)

#### GL Account Mapping Prompt
Expert in selecting optimal GL accounts based on accounting principles and business rules.

**Features:**
- Accounting principles enforcement (Asset/Liability/Revenue/Expense)
- Debit/Credit logic validation
- Auto-approval criteria assessment
- Risk factor evaluation

#### Validation and Quality Control Prompt
Comprehensive validation for data integrity, accounting compliance, and business rules.

**Features:**
- Data integrity validation
- Accounting validation (debit/credit, account categories)
- Business rule validation
- Compliance checking

### 2. Message Templates (`MESSAGE_TEMPLATES`)

#### Pattern Matching Template
```javascript
const promptMessages = MESSAGE_TEMPLATES.PATTERN_MATCHING.createMessage(
  transactions, 
  patterns, 
  context
);
```

#### GL Account Mapping Template
```javascript
const promptMessages = MESSAGE_TEMPLATES.GL_ACCOUNT_MAPPING.createMessage(
  transaction,
  glPatterns,
  context
);
```

#### Batch Validation Template
```javascript
const promptMessages = MESSAGE_TEMPLATES.BATCH_VALIDATION.createMessage(
  suggestions,
  validationRules,
  context
);
```

### 3. Few-Shot Examples (`FEW_SHOT_EXAMPLES`)

Provides concrete examples to improve AI accuracy:

```javascript
// Pattern matching examples
{
  input: {
    transaction: { amount: 1250.50, reference_number: "INV123456", ... },
    patterns: [...]
  },
  output: {
    matches: { "TXN_001": [{ pattern_id: "PTN_001", match_strength: 0.95, ... }] },
    confidences: { "TXN_001": { overall_confidence: 0.92, ... } },
    reasoning: { "TXN_001": "High confidence invoice payment..." }
  }
}
```

### 4. Context Injection Strategies (`CONTEXT_STRATEGIES`)

#### Customer Account Context
Injects customer profile and historical transaction patterns:
```javascript
CUSTOMER_ACCOUNT_CONTEXT(customerInfo, accountHistory)
```

#### Business Rules Context  
Applies company-specific rules and compliance requirements:
```javascript
BUSINESS_RULES_CONTEXT(businessRules, complianceSettings)
```

#### Temporal Context
Considers processing date, business calendar, and seasonal factors:
```javascript
TEMPORAL_CONTEXT(processingDate, businessCalendar)
```

### 5. Output Format Specifications (`OUTPUT_FORMATS`)

Structured JSON schemas ensure consistent AI responses:

```javascript
// Pattern matching output format
{
  transaction_results: {
    "TXN_ID": {
      patterns_matched: [...],
      confidence_scores: { overall_confidence: 0.0-1.0, ... },
      reasoning: "string",
      recommended_action: "AUTO_PROCESS|HUMAN_REVIEW|ADDITIONAL_DATA_NEEDED"
    }
  },
  batch_summary: {
    total_processed: number,
    successful_matches: number,
    average_confidence: 0.0-1.0
  }
}
```

## Quick Start Guide

### 1. Basic Pattern Matching

```javascript
import { createPatternMatchingPrompt } from '../prompts/cashClearingPrompts.js';

const transactions = [
  {
    transaction_id: "TXN_001",
    amount: 2500.00,
    reference_number: "INV789012",
    description: "INVOICE PAYMENT FOR CONSULTING SERVICES"
  }
];

const patterns = [
  {
    pattern_id: "PTN_001",
    pattern_name: "Invoice Reference Match",
    pattern_type: "REFERENCE",
    pattern_regex: "INV[-_]?\\d{6,}",
    confidence_weight: 0.8
  }
];

const promptMessages = createPatternMatchingPrompt(transactions, patterns, {
  batchId: "BATCH_001",
  includeFewShot: true,
  qualityThreshold: 0.6
});

// Use with AI model
const result = await generateText({
  model: openai('gpt-4-turbo'),
  messages: promptMessages,
  responseFormat: { type: 'json' }
});
```

### 2. Enhanced Processor Integration

```javascript
import { createEnhancedCashClearingProcessor } from '../prompts/promptIntegration.js';
import { CashClearingProcessor } from '../processors/cashClearingProcessor.js';

// Create base processor
const baseProcessor = new CashClearingProcessor({
  dataset: 'financial_data',
  approvalThreshold: 0.95
});

// Enhance with advanced prompting
const enhancedProcessor = createEnhancedCashClearingProcessor(baseProcessor, {
  model: 'gpt-4-turbo',
  enableDetailedLogging: true,
  includeFewShotExamples: true
});

// Execute enhanced workflow
const results = await enhancedProcessor.executeCashClearingWorkflow({
  batchSize: 100,
  processingMode: 'ENHANCED',
  validationLevel: 'COMPREHENSIVE'
});
```

### 3. Custom Prompt Building

```javascript
import { CashClearingPromptBuilder } from '../prompts/cashClearingPrompts.js';

const promptBuilder = new CashClearingPromptBuilder();

// Build pattern matching prompt with context
const promptMessages = promptBuilder.buildPatternMatchingPrompt(
  transactions,
  patterns,
  { includeFewShot: true, businessContext: { fiscal_period: 'Q1_2024' } }
);

// Inject customer context
promptBuilder.injectContext(
  promptMessages,
  'CUSTOMER_ACCOUNT_CONTEXT',
  [customerInfo, accountHistory]
);

// Add business rules context
promptBuilder.injectContext(
  promptMessages,
  'BUSINESS_RULES_CONTEXT', 
  [businessRules, complianceSettings]
);
```

## Advanced Features

### 1. Confidence Calculation

Multi-factor confidence scoring system:

```javascript
import { CONFIDENCE_CALCULATORS } from '../prompts/cashClearingPrompts.js';

const confidenceFactors = {
  pattern_match: 0.92,
  amount_validation: 0.85,
  description_analysis: 0.88,
  business_rules: 0.95,
  historical_precedent: 0.78
};

const overallConfidence = CONFIDENCE_CALCULATORS.calculateOverallConfidence(confidenceFactors);
```

### 2. Error Handling for Edge Cases

#### Ambiguous Patterns
```javascript
const enhancedAI = new EnhancedCashClearingAI();

const ambiguityResult = await enhancedAI.handleAmbiguousTransaction(
  transaction,
  availablePatterns,
  { ambiguityIndicators: ['Multiple possible patterns'] }
);
```

#### Low Confidence Transactions
```javascript
const lowConfResult = await enhancedAI.handleLowConfidenceTransaction(
  transaction,
  analysis,
  { confidenceFactors: { pattern_quality: 'LOW' } }
);
```

### 3. Batch Processing with Validation

```javascript
const validationResults = await enhancedAI.validateCashClearingSuggestions(
  suggestions,
  validationRules,
  {
    validationLevel: 'COMPREHENSIVE',
    autoApproveThreshold: 0.95,
    riskTolerance: 'MEDIUM'
  }
);
```

## Configuration Options

### AI Model Configuration
```javascript
{
  model: 'gpt-4-turbo',
  temperature: 0.1,
  maxTokens: 4000,
  timeout: 30000,
  fallbackModel: 'gpt-3.5-turbo'
}
```

### Processing Configuration
```javascript
{
  batchSize: 100,
  concurrency: 3,
  enableDetailedLogging: true,
  includeFewShotExamples: true,
  qualityThreshold: 0.6
}
```

### Approval Configuration
```javascript
{
  autoApproveThreshold: 0.95,
  requireHumanApproval: true,
  approvalLevels: [
    { level: 1, threshold: 0.7, approvers: ['finance_analyst'] },
    { level: 2, threshold: 0.5, approvers: ['finance_manager'] },
    { level: 3, threshold: 0.0, approvers: ['finance_director'] }
  ]
}
```

## Pattern Types and Examples

### 1. SETTLEMENT Patterns
- **Description**: Inter-account settlements and transfers
- **Examples**: "SETTLEMENT BETWEEN ACCOUNTS", "INTERCOMPANY TRANSFER"
- **GL Accounts**: Cash accounts (1010, 1020)

### 2. TOPUP Patterns  
- **Description**: Account funding and reload transactions
- **Examples**: "ACCOUNT TOPUP", "WALLET RELOAD", "PREPAID FUNDING"
- **GL Accounts**: Cash (1010) or Prepaid Assets (1300)

### 3. FOREX Patterns
- **Description**: Foreign exchange transactions
- **Examples**: "FX CONVERSION", "CURRENCY EXCHANGE", "FOREX TRADE"
- **GL Accounts**: Cash (1010) + FX Gain/Loss (4900/5900)

### 4. WIRE_TRANSFER Patterns
- **Description**: Wire transfer payments and receipts
- **Examples**: "WIRE TRANSFER TO VENDOR", "INTERNATIONAL WIRE"
- **GL Accounts**: Cash (1010), Wire fees (5200)

### 5. ACH_PAYMENT Patterns
- **Description**: Automated clearing house payments
- **Examples**: "ACH PAYMENT", "ELECTRONIC TRANSFER", "DIRECT DEPOSIT"
- **GL Accounts**: Cash (1010), ACH fees (5200)

## GL Account Mapping Rules

### Account Categories and Ranges

| Category | Range | Default DR/CR | Common Accounts |
|----------|-------|---------------|-----------------|
| ASSET | 1000-1999 | DR | 1010 (Cash), 1200 (A/R) |
| LIABILITY | 2000-2999 | CR | 2100 (A/P), 2200 (Accrued) |
| EQUITY | 3000-3999 | CR | 3000 (Capital), 3900 (Retained) |
| REVENUE | 4000-4999 | CR | 4100 (Sales), 4900 (Other) |
| EXPENSE | 5000-5999 | DR | 5100 (Fees), 5200 (Bank) |

### Mapping Confidence Factors

1. **Pattern Alignment (40%)**: How well the pattern matches account purpose
2. **Amount Validation (20%)**: Amount appropriateness for account type  
3. **Business Rules (20%)**: Compliance with company-specific rules
4. **Historical Precedent (10%)**: Similar past transactions
5. **Risk Assessment (10%)**: Potential for errors or fraud

## Best Practices

### 1. Prompt Engineering
- Use specific, detailed system prompts
- Include relevant few-shot examples
- Inject appropriate context for business scenario
- Specify output format requirements clearly

### 2. Context Management
- Inject customer context for personalized processing
- Apply business rules consistently
- Consider temporal factors (month-end, holidays)
- Use historical data for precedent analysis

### 3. Confidence Scoring
- Use multi-factor confidence calculation
- Set appropriate thresholds for auto-approval
- Implement escalation for low confidence cases
- Document confidence decision factors

### 4. Error Handling
- Implement fallback strategies for AI failures
- Handle ambiguous cases with special prompts
- Provide clear error messages and recovery options
- Log all error scenarios for improvement

### 5. Validation and Quality Control
- Validate all AI outputs before processing
- Implement comprehensive business rule checks
- Perform batch-level quality assessment
- Generate actionable recommendations

## Performance Optimization

### 1. Batch Processing
- Process transactions in optimal batch sizes (50-100)
- Use parallel processing for large volumes
- Implement intelligent batching based on complexity

### 2. Caching Strategies
- Cache pattern matching results
- Store GL mapping precedents
- Use customer context caching

### 3. Model Selection
- Use GPT-4 Turbo for complex reasoning
- Consider GPT-3.5 Turbo for simple cases
- Implement model fallback strategies

## Monitoring and Alerting

### Key Metrics to Track
- Average confidence scores
- Pattern matching accuracy
- GL mapping success rates
- Processing time per transaction
- Auto-approval rates
- Error rates by category

### Alert Thresholds
- Confidence score drops below 0.7
- Error rate exceeds 5%
- Processing time exceeds 30 seconds
- Large number of pending approvals

## Troubleshooting Guide

### Common Issues and Solutions

1. **Low Confidence Scores**
   - Check pattern regex accuracy
   - Improve description quality
   - Add more few-shot examples
   - Adjust confidence weights

2. **Incorrect GL Mappings**
   - Review GL pattern configurations
   - Validate business rules
   - Check account category mappings
   - Update approval thresholds

3. **AI Processing Errors**
   - Verify model availability
   - Check prompt format
   - Validate input data structure
   - Implement fallback strategies

4. **Performance Issues**
   - Optimize batch sizes
   - Reduce prompt complexity
   - Implement caching
   - Use appropriate model for task complexity

## Security Considerations

### Data Protection
- Sanitize sensitive data in prompts
- Use secure AI model endpoints
- Implement audit logging
- Control access to prompt configurations

### Compliance
- Ensure SOX compliance for financial data
- Implement segregation of duties
- Maintain comprehensive audit trails
- Document all AI decision factors

## Integration Testing

### Test Categories
1. **Unit Tests**: Individual prompt components
2. **Integration Tests**: End-to-end workflow
3. **Performance Tests**: Large batch processing
4. **Accuracy Tests**: Pattern matching precision
5. **Edge Case Tests**: Error handling scenarios

### Sample Test Cases
```javascript
// Test pattern matching accuracy
const testCase = {
  input: { transaction: {...}, patterns: [...] },
  expected: { confidence: >=0.8, pattern: "INVOICE" },
  actual: runPatternMatching(input)
};

// Test GL mapping logic
const glTest = {
  input: { transaction: {...}, glPatterns: [...] },
  expected: { gl_account: "1200", requires_approval: false },
  actual: runGLMapping(input)
};
```

## Future Enhancements

### Planned Features
1. **Machine Learning Integration**: Train custom models on historical data
2. **Advanced Context**: Customer behavior analysis, seasonal patterns
3. **Real-time Processing**: Stream processing capabilities
4. **Multi-language Support**: Process transactions in multiple languages
5. **Advanced Validation**: Fraud detection, anomaly detection

### Roadmap
- Q2 2024: Enhanced confidence algorithms
- Q3 2024: Real-time processing capabilities  
- Q4 2024: Machine learning model training
- Q1 2025: Advanced fraud detection

---

For additional support and examples, see the [examples directory](../examples/) and [test cases](../tests/).