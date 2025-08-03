-- BigQuery Schema for Cash Clearing Workflow - AI_POC Dataset
-- Project: ksingamsetty-test
-- Dataset: AI_POC
-- Updated for production cash clearing operations

-- Enable required BigQuery features
SET @@dataset_project_id = 'ksingamsetty-test';
SET @@dataset_id = 'AI_POC';

-- Table 1: cash_transactions
-- Stores cash transactions that need to be processed through the workflow
DROP TABLE IF EXISTS `ksingamsetty-test.AI_POC.cash_transactions`;
CREATE TABLE `ksingamsetty-test.AI_POC.cash_transactions` (
  bt_id STRING NOT NULL,                          -- Business transaction ID
  customer_account_number STRING NOT NULL,        -- Customer account identifier
  type_code STRING,                              -- Transaction type code
  text STRING,                                   -- Transaction description/narrative
  pattern STRING DEFAULT 'T_NOTFOUND',          -- Processing pattern status
  amount NUMERIC(15,2),                         -- Transaction amount
  currency_code STRING DEFAULT 'USD',           -- Currency
  transaction_date DATE,                         -- Transaction date
  value_date DATE,                              -- Value date
  reference_number STRING,                       -- Reference/check number
  source_system STRING,                         -- Originating system
  batch_id STRING,                              -- Processing batch identifier
  external_reference STRING,                    -- External system reference
  counterparty_info JSON,                       -- Counterparty details
  original_data JSON,                           -- Raw transaction data
  processing_status STRING DEFAULT 'PENDING',   -- PENDING, PROCESSING, COMPLETED, FAILED
  error_details JSON,                           -- Error information if processing fails
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  processed_at TIMESTAMP                        -- When processing completed
)
PARTITION BY DATE(transaction_date)
CLUSTER BY pattern, customer_account_number, processing_status
OPTIONS(
  description="Cash transactions requiring pattern matching and GL account assignment",
  labels=[("environment", "production"), ("workflow", "cash-clearing")]
);

-- Table 2: cash_processor_patterns  
-- Defines patterns for automatic transaction classification
DROP TABLE IF EXISTS `ksingamsetty-test.AI_POC.cash_processor_patterns`;
CREATE TABLE `ksingamsetty-test.AI_POC.cash_processor_patterns` (
  pattern_id STRING NOT NULL,                   -- Unique pattern identifier
  pattern_name STRING NOT NULL,                 -- Human-readable pattern name
  pattern_search STRING,                        -- Search criteria/regex
  pattern_op STRING,                            -- Operation type (CONTAINS, REGEX, EXACT, STARTS_WITH, ENDS_WITH)
  pattern_type STRING NOT NULL,                 -- REFERENCE, AMOUNT, DESCRIPTION, COMPOSITE, ML
  pattern_regex STRING,                         -- Regular expression if applicable
  amount_range_min NUMERIC(15,2),              -- Minimum amount for pattern match
  amount_range_max NUMERIC(15,2),              -- Maximum amount for pattern match
  confidence_weight NUMERIC(4,3) DEFAULT 0.500, -- Pattern confidence weight (0-1)
  priority_order INT64 DEFAULT 100,            -- Processing priority (lower = higher priority)
  business_rules JSON,                          -- Additional business logic
  is_active BOOLEAN DEFAULT TRUE,               -- Pattern is active
  requires_human_review BOOLEAN DEFAULT FALSE,  -- Requires manual verification
  auto_approve_threshold NUMERIC(4,3) DEFAULT 0.950, -- Auto-approval confidence threshold
  tags ARRAY<STRING>,                          -- Classification tags
  effective_date DATE,                          -- When pattern becomes effective
  expiration_date DATE,                         -- When pattern expires
  created_by STRING,                           -- Pattern creator
  approved_by STRING,                          -- Pattern approver
  version_number INT64 DEFAULT 1,              -- Pattern version
  metadata JSON,                               -- Additional pattern metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY is_active, priority_order, pattern_type
OPTIONS(
  description="Pattern definitions for automated transaction classification",
  labels=[("environment", "production"), ("workflow", "cash-clearing")]
);

-- Table 3: cash_gl_patterns
-- Maps transaction patterns to GL accounts and posting logic
DROP TABLE IF EXISTS `ksingamsetty-test.AI_POC.cash_gl_patterns`;
CREATE TABLE `ksingamsetty-test.AI_POC.cash_gl_patterns` (
  gl_pattern_id STRING NOT NULL,               -- Unique GL mapping identifier  
  pattern STRING NOT NULL,                     -- References cash_processor_patterns.pattern_name
  GL_ACCOUNT STRING NOT NULL,                  -- GL account code
  FT_ID STRING,                               -- Financial transaction type ID
  gl_account_name STRING,                     -- GL account description
  account_type STRING,                        -- ASSET, LIABILITY, EQUITY, REVENUE, EXPENSE
  debit_credit_indicator STRING NOT NULL,     -- 'DR' or 'CR'
  business_unit STRING,                       -- Business unit code
  cost_center STRING,                         -- Cost center code
  profit_center STRING,                       -- Profit center code
  company_code STRING,                        -- Company code
  functional_area STRING,                     -- Functional area
  project_id STRING,                          -- Project identifier
  trading_partner STRING,                     -- Trading partner code
  mapping_confidence NUMERIC(4,3) DEFAULT 0.800, -- Mapping confidence score
  auto_approve_threshold NUMERIC(4,3) DEFAULT 0.950, -- Auto-approval threshold
  requires_approval BOOLEAN DEFAULT TRUE,     -- Requires manual approval
  approval_workflow STRING,                   -- Approval workflow identifier
  posting_logic JSON,                        -- Complex posting logic rules
  validation_rules JSON,                     -- Validation criteria
  business_justification STRING,             -- Business reason for mapping
  regulatory_requirements ARRAY<STRING>,      -- Compliance requirements
  risk_category STRING,                      -- Risk classification
  audit_requirements JSON,                   -- Audit trail requirements
  effective_date DATE,                       -- When mapping becomes effective
  expiration_date DATE,                      -- When mapping expires
  created_by STRING,                         -- Mapping creator
  approved_by STRING,                        -- Mapping approver
  version_number INT64 DEFAULT 1,            -- Mapping version
  metadata JSON,                             -- Additional mapping metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY pattern, GL_ACCOUNT, requires_approval
OPTIONS(
  description="GL account mappings for transaction patterns with posting logic",
  labels=[("environment", "production"), ("workflow", "cash-clearing")]
);

-- Table 4: ai_cash_clearing_suggestions
-- Stores AI-generated cash clearing suggestions and results
DROP TABLE IF EXISTS `ksingamsetty-test.AI_POC.ai_cash_clearing_suggestions`;
CREATE TABLE `ksingamsetty-test.AI_POC.ai_cash_clearing_suggestions` (
  suggestion_id STRING DEFAULT GENERATE_UUID(), -- Unique suggestion identifier
  transaction_id STRING NOT NULL,              -- References cash_transactions.bt_id
  workflow_id STRING,                          -- Workflow execution identifier
  workflow_step INT64 NOT NULL,               -- Current workflow step (1-4)
  step_name STRING,                           -- Step description
  pattern_matched STRING,                     -- Matched pattern name
  pattern_confidence NUMERIC(4,3),           -- Pattern matching confidence
  gl_account_code STRING,                     -- Suggested GL account
  gl_account_name STRING,                     -- GL account description
  ft_id STRING,                              -- Financial transaction type
  debit_credit_indicator STRING,              -- 'DR' or 'CR'
  amount NUMERIC(15,2) NOT NULL,             -- Transaction amount
  currency_code STRING DEFAULT 'USD',        -- Currency
  business_unit STRING,                       -- Business unit
  cost_center STRING,                         -- Cost center
  profit_center STRING,                       -- Profit center
  overall_confidence_score NUMERIC(4,3) NOT NULL, -- Overall AI confidence
  confidence_breakdown JSON,                  -- Detailed confidence metrics
  ai_reasoning JSON NOT NULL,                -- AI explanation and evidence
  alternative_suggestions JSON,               -- Alternative mappings considered
  risk_assessment JSON,                      -- Risk analysis
  compliance_checks JSON,                    -- Regulatory compliance verification
  approval_status STRING DEFAULT 'PENDING',  -- PENDING, APPROVED, REJECTED, AUTO_APPROVED
  approval_reason STRING,                    -- Approval/rejection reason
  approved_by STRING,                        -- Approver identifier
  approved_at TIMESTAMP,                     -- Approval timestamp
  reviewer_comments STRING,                  -- Manual review comments
  processing_batch_id STRING,                -- Batch processing identifier
  ai_model STRING,                           -- AI model used
  model_version STRING,                      -- Model version
  prompt_version STRING,                     -- Prompt template version
  processing_time_ms INT64,                  -- Processing duration
  token_usage JSON,                          -- AI token consumption
  validation_checks JSON,                    -- Automated validation results
  exception_flags ARRAY<STRING>,             -- Exception conditions identified
  audit_trail JSON,                         -- Complete audit information
  quality_score NUMERIC(4,3),               -- Suggestion quality rating
  business_impact_assessment JSON,           -- Business impact analysis
  regulatory_impact JSON,                   -- Regulatory impact assessment
  error_details JSON,                       -- Error information if processing fails
  retry_count INT64 DEFAULT 0,              -- Number of processing retries
  source_data_hash STRING,                  -- Hash of source transaction data
  metadata JSON,                            -- Additional metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  processed_at TIMESTAMP                    -- When suggestion was generated
)
PARTITION BY DATE(created_at)
CLUSTER BY approval_status, overall_confidence_score, workflow_step
OPTIONS(
  description="AI-generated cash clearing suggestions with comprehensive audit trail",
  labels=[("environment", "production"), ("workflow", "cash-clearing")]
);

-- Table 5: cash_clearing_workflow_state
-- Tracks workflow execution state and progress
DROP TABLE IF EXISTS `ksingamsetty-test.AI_POC.cash_clearing_workflow_state`;
CREATE TABLE `ksingamsetty-test.AI_POC.cash_clearing_workflow_state` (
  workflow_id STRING DEFAULT GENERATE_UUID(), -- Unique workflow identifier
  batch_id STRING NOT NULL,                  -- Processing batch identifier
  workflow_type STRING DEFAULT 'STANDARD',   -- STANDARD, EXPRESS, MANUAL
  current_step INT64 DEFAULT 1,             -- Current step (1-4)
  step_status STRING DEFAULT 'RUNNING',     -- RUNNING, COMPLETED, FAILED, PAUSED
  total_transactions INT64 NOT NULL,        -- Total transactions in batch
  processed_transactions INT64 DEFAULT 0,   -- Successfully processed count
  failed_transactions INT64 DEFAULT 0,      -- Failed processing count
  auto_approved_count INT64 DEFAULT 0,      -- Auto-approved suggestions
  manual_review_count INT64 DEFAULT 0,      -- Requiring manual review
  step_1_status STRING DEFAULT 'PENDING',   -- PENDING, RUNNING, COMPLETED, FAILED
  step_1_completed_at TIMESTAMP,            -- Step 1 completion time
  step_1_result_count INT64,                -- Step 1 result count
  step_2_status STRING DEFAULT 'PENDING',   -- Pattern matching status
  step_2_completed_at TIMESTAMP,            -- Step 2 completion time
  step_2_result_count INT64,                -- Step 2 result count
  step_3_status STRING DEFAULT 'PENDING',   -- GL mapping status
  step_3_completed_at TIMESTAMP,            -- Step 3 completion time
  step_3_result_count INT64,                -- Step 3 result count
  step_4_status STRING DEFAULT 'PENDING',   -- Suggestion generation status
  step_4_completed_at TIMESTAMP,            -- Step 4 completion time
  step_4_result_count INT64,                -- Step 4 result count
  human_approval_required BOOLEAN DEFAULT FALSE, -- Requires human intervention
  approval_checkpoint_step INT64,           -- Step where approval is needed
  approval_deadline TIMESTAMP,              -- Approval deadline
  workflow_status STRING DEFAULT 'RUNNING', -- RUNNING, COMPLETED, FAILED, PAUSED
  workflow_priority STRING DEFAULT 'NORMAL', -- LOW, NORMAL, HIGH, URGENT
  initiated_by STRING,                      -- User/system that started workflow
  assigned_to STRING,                       -- Current assignee
  estimated_completion TIMESTAMP,           -- Estimated completion time
  actual_completion TIMESTAMP,              -- Actual completion time
  performance_metrics JSON,                 -- Performance statistics
  resource_usage JSON,                      -- Resource consumption metrics
  error_details JSON,                       -- Error information
  retry_count INT64 DEFAULT 0,             -- Number of retry attempts
  quality_metrics JSON,                     -- Quality assessment metrics
  business_impact JSON,                     -- Business impact assessment
  compliance_status JSON,                   -- Regulatory compliance status
  notification_sent BOOLEAN DEFAULT FALSE,  -- Notification status
  escalation_level INT64 DEFAULT 0,        -- Escalation level (0-3)
  sla_status STRING DEFAULT 'ON_TIME',     -- ON_TIME, AT_RISK, BREACHED
  metadata JSON,                            -- Additional workflow metadata
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
CLUSTER BY workflow_status, current_step, workflow_priority
OPTIONS(
  description="Workflow execution state tracking with comprehensive monitoring",
  labels=[("environment", "production"), ("workflow", "cash-clearing")]
);

-- Table 6: cash_clearing_audit_log
-- Comprehensive audit trail for all workflow operations
DROP TABLE IF EXISTS `ksingamsetty-test.AI_POC.cash_clearing_audit_log`;
CREATE TABLE `ksingamsetty-test.AI_POC.cash_clearing_audit_log` (
  audit_id STRING DEFAULT GENERATE_UUID(),  -- Unique audit record identifier
  workflow_id STRING,                       -- Associated workflow
  transaction_id STRING,                    -- Associated transaction
  suggestion_id STRING,                     -- Associated suggestion
  step_number INT64,                        -- Workflow step (0-4)
  action_type STRING NOT NULL,              -- Action classification
  action_subtype STRING,                    -- Action subcategory
  action_details JSON,                      -- Detailed action information
  actor_type STRING,                        -- SYSTEM, USER, AI, API
  actor_id STRING,                          -- Actor identifier
  user_id STRING,                           -- User performing action
  session_id STRING,                        -- Session identifier
  ip_address STRING,                        -- Source IP address
  user_agent STRING,                        -- User agent information
  ai_model STRING,                          -- AI model used
  ai_model_version STRING,                  -- AI model version
  confidence_score NUMERIC(4,3),           -- Action confidence
  processing_time_ms INT64,                -- Processing duration
  token_usage JSON,                        -- AI token consumption
  input_data JSON,                          -- Input parameters
  output_data JSON,                         -- Output results
  data_hash STRING,                         -- Data integrity hash
  before_state JSON,                        -- State before action
  after_state JSON,                         -- State after action
  business_context JSON,                   -- Business context information
  regulatory_context JSON,                 -- Regulatory compliance context
  risk_indicators ARRAY<STRING>,           -- Risk flags identified
  quality_indicators JSON,                 -- Quality metrics
  performance_indicators JSON,             -- Performance metrics
  exception_details JSON,                  -- Exception information
  error_details JSON,                      -- Error information
  validation_results JSON,                 -- Validation check results
  compliance_flags ARRAY<STRING>,          -- Compliance indicators
  security_context JSON,                   -- Security-related information
  data_lineage JSON,                       -- Data lineage tracking
  correlation_id STRING,                   -- Request correlation ID
  parent_audit_id STRING,                  -- Parent audit record
  related_audit_ids ARRAY<STRING>,         -- Related audit records
  retention_policy STRING DEFAULT 'STANDARD', -- STANDARD, EXTENDED, PERMANENT
  classification_level STRING DEFAULT 'INTERNAL', -- PUBLIC, INTERNAL, CONFIDENTIAL, RESTRICTED
  geographic_location STRING,              -- Processing location
  timezone STRING DEFAULT 'UTC',           -- Timezone context
  business_date DATE,                       -- Business processing date
  fiscal_period STRING,                    -- Fiscal period
  metadata JSON,                           -- Additional audit metadata
  timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY DATE(timestamp)
CLUSTER BY workflow_id, step_number, action_type
OPTIONS(
  description="Comprehensive audit trail for cash clearing workflow operations",
  labels=[("environment", "production"), ("workflow", "cash-clearing"), ("audit", "comprehensive")]
);

-- Create optimized indexes for performance
-- These will be created automatically with clustering, but defining explicitly for clarity

-- Performance optimization views
CREATE OR REPLACE VIEW `ksingamsetty-test.AI_POC.v_cash_clearing_dashboard` AS
SELECT 
  w.workflow_id,
  w.batch_id,
  w.workflow_status,
  w.current_step,
  w.total_transactions,
  w.processed_transactions,
  w.failed_transactions,
  w.auto_approved_count,
  w.manual_review_count,
  TIMESTAMP_DIFF(COALESCE(w.actual_completion, CURRENT_TIMESTAMP()), w.created_at, MINUTE) as processing_time_minutes,
  CASE 
    WHEN w.workflow_status = 'COMPLETED' THEN 100.0
    ELSE ROUND((w.processed_transactions / NULLIF(w.total_transactions, 0)) * 100.0, 2)
  END as completion_percentage,
  w.sla_status,
  w.escalation_level,
  w.created_at,
  w.updated_at
FROM `ksingamsetty-test.AI_POC.cash_clearing_workflow_state` w;

CREATE OR REPLACE VIEW `ksingamsetty-test.AI_POC.v_pending_approvals` AS
SELECT 
  s.suggestion_id,
  s.transaction_id,
  s.workflow_id,
  s.pattern_matched,
  s.gl_account_code,
  s.gl_account_name,
  s.amount,
  s.overall_confidence_score,
  s.approval_status,
  s.created_at,
  TIMESTAMP_DIFF(CURRENT_TIMESTAMP(), s.created_at, HOUR) as hours_pending,
  t.customer_account_number,
  t.text as transaction_description
FROM `ksingamsetty-test.AI_POC.ai_cash_clearing_suggestions` s
JOIN `ksingamsetty-test.AI_POC.cash_transactions` t ON s.transaction_id = t.bt_id
WHERE s.approval_status = 'PENDING'
ORDER BY s.overall_confidence_score DESC, s.created_at ASC;

-- Grant appropriate permissions (adjust as needed for your environment)
-- GRANT SELECT ON `ksingamsetty-test.AI_POC.v_cash_clearing_dashboard` TO GROUP `cash-clearing-users`;
-- GRANT SELECT ON `ksingamsetty-test.AI_POC.v_pending_approvals` TO GROUP `cash-clearing-approvers`;

-- Add table comments and labels for better documentation
ALTER TABLE `ksingamsetty-test.AI_POC.cash_transactions` 
SET OPTIONS(
  description="Source cash transactions requiring automated clearing through AI workflow",
  labels=[("environment", "production"), ("workflow", "cash-clearing"), ("data-type", "transaction")]
);

ALTER TABLE `ksingamsetty-test.AI_POC.cash_processor_patterns` 
SET OPTIONS(
  description="Pattern definitions for automated transaction classification and matching",
  labels=[("environment", "production"), ("workflow", "cash-clearing"), ("data-type", "configuration")]
);

ALTER TABLE `ksingamsetty-test.AI_POC.cash_gl_patterns` 
SET OPTIONS(
  description="GL account mapping rules for transaction patterns with business logic",
  labels=[("environment", "production"), ("workflow", "cash-clearing"), ("data-type", "configuration")]
);

ALTER TABLE `ksingamsetty-test.AI_POC.ai_cash_clearing_suggestions` 
SET OPTIONS(
  description="AI-generated suggestions for cash clearing with comprehensive audit trail",
  labels=[("environment", "production"), ("workflow", "cash-clearing"), ("data-type", "results")]
);

-- Success confirmation
SELECT 'BigQuery schema for AI_POC cash clearing workflow created successfully' as status,
       CURRENT_TIMESTAMP() as created_at;