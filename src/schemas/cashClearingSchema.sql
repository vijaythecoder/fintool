-- Cash Clearing Workflow Tables for BigQuery
-- Dataset: ksingamsetty-test.AI_POC

-- Table 1: cash_transactions
-- Stores cash transactions with pattern status
CREATE TABLE IF NOT EXISTS `ksingamsetty-test.AI_POC.cash_transactions` (
  bt_id STRING NOT NULL,
  customer_account_number STRING NOT NULL,
  type_code STRING,
  text STRING,
  pattern STRING DEFAULT 'T_NOTFOUND',
  amount NUMERIC(10,2) NOT NULL,
  transaction_date DATE NOT NULL,
  currency_code STRING DEFAULT 'USD',
  source_system STRING,
  batch_id STRING,
  original_data JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY transaction_date
CLUSTER BY pattern, customer_account_number;

-- Table 2: cash_processor_patterns
-- Pattern definitions for matching
CREATE TABLE IF NOT EXISTS `ksingamsetty-test.AI_POC.cash_processor_patterns` (
  pattern_id STRING DEFAULT GENERATE_UUID(),
  customer_account_number STRING,
  type_code STRING,
  pattern_search STRING NOT NULL,
  pattern_op STRING NOT NULL,
  pattern_type STRING DEFAULT 'DESCRIPTION',
  pattern_regex STRING,
  confidence_weight FLOAT64 DEFAULT 1.0,
  priority_order INT64 DEFAULT 100,
  is_active BOOLEAN DEFAULT true,
  usage_count INT64 DEFAULT 0,
  last_used_at TIMESTAMP,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY customer_account_number, type_code, pattern_op;

-- Table 3: cash_gl_patterns
-- GL account mapping patterns
CREATE TABLE IF NOT EXISTS `ksingamsetty-test.AI_POC.cash_gl_patterns` (
  gl_pattern_id STRING DEFAULT GENERATE_UUID(),
  pattern STRING NOT NULL,
  customer_account_number STRING,
  type_code STRING,
  GL_ACCOUNT STRING NOT NULL,
  FT_ID STRING NOT NULL,
  gl_account_name STRING,
  debit_credit_indicator STRING CHECK (debit_credit_indicator IN ('DR', 'CR')),
  account_category STRING CHECK (account_category IN ('ASSET', 'LIABILITY', 'REVENUE', 'EXPENSE', 'EQUITY')),
  business_unit STRING,
  cost_center STRING,
  mapping_confidence FLOAT64 DEFAULT 0.8,
  auto_approve_threshold FLOAT64 DEFAULT 0.95,
  requires_approval BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY pattern, customer_account_number;

-- Table 4: ai_cash_clearing_suggestions
-- AI-generated clearing suggestions
CREATE TABLE IF NOT EXISTS `ksingamsetty-test.AI_POC.ai_cash_clearing_suggestions` (
  suggestion_id STRING DEFAULT GENERATE_UUID(),
  bt_id STRING NOT NULL,
  transaction_id STRING NOT NULL,
  workflow_step INT64 CHECK (workflow_step BETWEEN 1 AND 4),
  
  -- AI Suggestion Fields
  AI_SUGGEST_TEXT STRING,
  AI_CONFIDENCE_SCORE FLOAT64 CHECK (AI_CONFIDENCE_SCORE BETWEEN 0 AND 1),
  AI_REASON STRING,
  AI_GL_ACCOUNT STRING,
  AI_PRCSSR_PTRN_FT STRING,
  
  -- Pattern and GL Details
  pattern_matched STRING,
  gl_account_code STRING,
  gl_account_name STRING,
  debit_credit_indicator STRING CHECK (debit_credit_indicator IN ('DR', 'CR')),
  amount NUMERIC(10,2),
  
  -- Approval Workflow
  approval_status STRING DEFAULT 'PENDING' CHECK (approval_status IN ('PENDING', 'APPROVED', 'REJECTED', 'AUTO_APPROVED')),
  approved_by STRING,
  approved_at TIMESTAMP,
  
  -- Processing Metadata
  processing_batch_id STRING,
  ai_model STRING,
  processing_time_ms INT64,
  confidence_score FLOAT64,
  reasoning JSON,
  validation_checks JSON,
  error_details JSON,
  metadata JSON,
  
  -- Timestamps
  UPDATED_AT TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(created_at)
CLUSTER BY approval_status, bt_id;

-- Table 5: cash_clearing_workflow_state
-- Workflow execution state tracking
CREATE TABLE IF NOT EXISTS `ksingamsetty-test.AI_POC.cash_clearing_workflow_state` (
  workflow_id STRING DEFAULT GENERATE_UUID(),
  batch_id STRING NOT NULL,
  current_step INT64 DEFAULT 1 CHECK (current_step BETWEEN 1 AND 4),
  total_transactions INT64 DEFAULT 0,
  processed_transactions INT64 DEFAULT 0,
  failed_transactions INT64 DEFAULT 0,
  step_1_completed_at TIMESTAMP,
  step_2_completed_at TIMESTAMP,
  step_3_completed_at TIMESTAMP,
  step_4_completed_at TIMESTAMP,
  human_approval_required BOOLEAN DEFAULT false,
  approval_checkpoint_step INT64,
  workflow_status STRING DEFAULT 'RUNNING' CHECK (workflow_status IN ('RUNNING', 'COMPLETED', 'FAILED', 'PAUSED')),
  error_details JSON,
  metadata JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(created_at)
CLUSTER BY workflow_status, batch_id;

-- Table 6: cash_clearing_audit_log
-- Comprehensive audit trail
CREATE TABLE IF NOT EXISTS `ksingamsetty-test.AI_POC.cash_clearing_audit_log` (
  audit_id STRING DEFAULT GENERATE_UUID(),
  workflow_id STRING,
  transaction_id STRING,
  step_number INT64,
  action_type STRING CHECK (action_type IN ('QUERY', 'MATCH', 'GL_MAPPING', 'APPROVE', 'REJECT', 'AUTO_PROCESS', 'ERROR', 'WORKFLOW_STARTED', 'WORKFLOW_COMPLETED', 'SUGGESTIONS_CREATED')),
  action_details JSON,
  user_id STRING,
  ai_model STRING,
  confidence_score FLOAT64,
  processing_time_ms INT64,
  input_data JSON,
  output_data JSON,
  error_details JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(created_at)
CLUSTER BY workflow_id, action_type;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_cash_trans_pattern_notfound 
ON `ksingamsetty-test.AI_POC.cash_transactions`(pattern, bt_id)
WHERE pattern = 'T_NOTFOUND';

CREATE INDEX IF NOT EXISTS idx_suggestions_pending 
ON `ksingamsetty-test.AI_POC.ai_cash_clearing_suggestions`(approval_status, bt_id)
WHERE approval_status = 'PENDING';

CREATE INDEX IF NOT EXISTS idx_workflow_active 
ON `ksingamsetty-test.AI_POC.cash_clearing_workflow_state`(workflow_status, batch_id)
WHERE workflow_status IN ('RUNNING', 'PAUSED');

-- Sample data for testing
-- INSERT INTO `ksingamsetty-test.AI_POC.cash_processor_patterns` 
-- (customer_account_number, type_code, pattern_search, pattern_op, pattern_type, confidence_weight)
-- VALUES
-- ('ACC001', 'CREDIT', 'SETTLEMENT', 'SETTLEMENT', 'DESCRIPTION', 0.9),
-- ('ACC001', 'DEBIT', 'TOPUP', 'TOPUP', 'DESCRIPTION', 0.85),
-- ('ACC001', 'CREDIT', 'FOREX', 'FOREX', 'DESCRIPTION', 0.95),
-- ('ACC002', 'CREDIT', 'WIRE TRANSFER', 'WIRE_TRANSFER', 'DESCRIPTION', 0.9),
-- ('ACC002', 'DEBIT', 'ACH PAYMENT', 'ACH_PAYMENT', 'DESCRIPTION', 0.88);

-- INSERT INTO `ksingamsetty-test.AI_POC.cash_gl_patterns`
-- (pattern, customer_account_number, type_code, GL_ACCOUNT, FT_ID, gl_account_name, debit_credit_indicator, account_category)
-- VALUES
-- ('SETTLEMENT', 'ACC001', 'CREDIT', '1200', 'FT001', 'Cash Settlement Account', 'DR', 'ASSET'),
-- ('TOPUP', 'ACC001', 'DEBIT', '2100', 'FT002', 'Customer Deposits', 'CR', 'LIABILITY'),
-- ('FOREX', 'ACC001', 'CREDIT', '4100', 'FT003', 'Foreign Exchange Revenue', 'CR', 'REVENUE'),
-- ('WIRE_TRANSFER', 'ACC002', 'CREDIT', '1100', 'FT004', 'Wire Transfer Clearing', 'DR', 'ASSET'),
-- ('ACH_PAYMENT', 'ACC002', 'DEBIT', '5100', 'FT005', 'ACH Processing Expense', 'DR', 'EXPENSE');