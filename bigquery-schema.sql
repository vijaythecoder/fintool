-- AI-Enhanced Cash Clearing Resolution System
-- BigQuery Schema Setup Script

-- Create dataset (replace 'financial_data' with your preferred dataset name)
-- CREATE SCHEMA IF NOT EXISTS `your-project-id.financial_data`;

-- Table: unmatched_transactions
-- Stores transactions that couldn't be matched by rule-based systems
CREATE TABLE IF NOT EXISTS `financial_data.unmatched_transactions` (
  transaction_id STRING NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  reference_number STRING,
  merchant_name STRING,
  transaction_date DATE NOT NULL,
  original_description STRING,
  status STRING DEFAULT 'T_NOT_FOUND',
  retry_count INT64 DEFAULT 0,
  processed_timestamp TIMESTAMP,
  processing_method STRING,
  match_confidence FLOAT64,
  matched_transaction_id STRING,
  enrichment_notes STRING,
  potential_matches JSON,
  last_processed TIMESTAMP,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP(),
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY transaction_date
CLUSTER BY status, merchant_name;

-- Table: all_transactions
-- Master table containing all transactions for matching
CREATE TABLE IF NOT EXISTS `financial_data.all_transactions` (
  transaction_id STRING NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  reference_number STRING,
  merchant_name STRING,
  transaction_date DATE NOT NULL,
  status STRING DEFAULT 'PENDING',
  account_number STRING,
  transaction_type STRING,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY transaction_date
CLUSTER BY status, reference_number;

-- Table: matched_transactions
-- Successfully matched transactions
CREATE TABLE IF NOT EXISTS `financial_data.matched_transactions` (
  transaction_id STRING NOT NULL,
  original_transaction_id STRING NOT NULL,
  matched_transaction_id STRING NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  reference_number STRING,
  merchant_name STRING,
  transaction_date DATE NOT NULL,
  match_confidence FLOAT64 NOT NULL,
  match_reasons JSON,
  processing_method STRING,
  processed_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY transaction_date;

-- Table: enriched_transactions
-- Transactions with enrichment notes for human review
CREATE TABLE IF NOT EXISTS `financial_data.enriched_transactions` (
  transaction_id STRING NOT NULL,
  amount NUMERIC(10,2) NOT NULL,
  reference_number STRING,
  merchant_name STRING,
  transaction_date DATE NOT NULL,
  potential_matches JSON,
  match_confidence FLOAT64,
  enrichment_notes STRING,
  processing_method STRING,
  processed_timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY transaction_date;

-- Table: processing_log
-- Audit log for all processing runs
CREATE TABLE IF NOT EXISTS `financial_data.processing_log` (
  log_id STRING DEFAULT GENERATE_UUID(),
  processing_date DATE NOT NULL,
  processing_method STRING NOT NULL,
  total_processed INT64 DEFAULT 0,
  matched_count INT64 DEFAULT 0,
  enriched_count INT64 DEFAULT 0,
  failed_count INT64 DEFAULT 0,
  avg_confidence FLOAT64,
  processing_time_ms INT64,
  items_per_second FLOAT64,
  error_details JSON,
  metadata JSON,
  timestamp TIMESTAMP NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP()
)
PARTITION BY processing_date;

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_unmatched_status_date 
ON `financial_data.unmatched_transactions`(status, transaction_date);

CREATE INDEX IF NOT EXISTS idx_all_trans_reference 
ON `financial_data.all_transactions`(reference_number);

CREATE INDEX IF NOT EXISTS idx_matched_confidence 
ON `financial_data.matched_transactions`(match_confidence);

-- Sample data insertion (for testing)
-- INSERT INTO `financial_data.unmatched_transactions` 
-- (transaction_id, amount, reference_number, merchant_name, transaction_date, original_description)
-- VALUES
-- ('TXN_001', 1250.50, 'REF123456', 'AMAZON WEB SERVICES', CURRENT_DATE() - 1, 'AWS CLOUD SERVICES'),
-- ('TXN_002', 500.00, 'INV789012', 'GOOGLE CLOUD', CURRENT_DATE() - 1, 'GCP MONTHLY BILLING'),
-- ('TXN_003', 750.25, 'PO345678', 'MICROSOFT AZURE', CURRENT_DATE() - 1, 'AZURE SUBSCRIPTION');