export interface Transaction {
  transaction_id: string;
  amount: number;
  reference_number: string;
  merchant_name: string;
  transaction_date: string;
  status: string;
  match_confidence?: number;
  matched_transaction_id?: string;
  enrichment_notes?: string;
  retry_count?: number;
  processed_timestamp?: string;
}

export interface TransactionStats {
  total_processed: number;
  matched: number;
  enriched: number;
  failed: number;
  success_rate: number;
  avg_confidence: number;
  processing_date: string;
}

export interface ChartData {
  date: string;
  matched: number;
  unmatched: number;
  enriched: number;
}

export interface ProcessingLog {
  processing_date: string;
  processing_method: string;
  total_processed: number;
  matched_count: number;
  enriched_count: number;
  failed_count: number;
  avg_confidence: number;
  processing_time_ms: number;
  items_per_second: number;
  timestamp: string;
}

// Cash Clearing Workflow Types
export interface CashTransaction {
  transaction_id: string;
  amount: number;
  reference_number?: string;
  description: string;
  transaction_date: string;
  account_id: string;
  currency_code: string;
  pattern: string;
  source_system: string;
  batch_id?: string;
  original_data?: Record<string, any>;
  created_at?: string;
  updated_at?: string;
}

export interface ProcessorPattern {
  pattern_id: string;
  pattern_name: string;
  pattern_type: 'REFERENCE' | 'AMOUNT' | 'DESCRIPTION' | 'COMPOSITE';
  pattern_regex?: string;
  amount_tolerance: number;
  date_tolerance_days: number;
  confidence_weight: number;
  priority_order: number;
  is_active: boolean;
  metadata?: Record<string, any>;
}

export interface GLPattern {
  gl_pattern_id: string;
  pattern_id: string;
  gl_account_code: string;
  gl_account_name: string;
  debit_credit_indicator: 'DR' | 'CR';
  account_category: 'ASSET' | 'LIABILITY' | 'REVENUE' | 'EXPENSE';
  business_unit?: string;
  cost_center?: string;
  mapping_confidence: number;
  auto_approve_threshold: number;
  requires_approval: boolean;
  metadata?: Record<string, any>;
}

export interface CashClearingSuggestion {
  suggestion_id?: string;
  transaction_id: string;
  workflow_step: 1 | 2 | 3 | 4;
  pattern_matched?: string;
  gl_account_code?: string;
  gl_account_name?: string;
  debit_credit_indicator?: 'DR' | 'CR';
  amount: number;
  confidence_score: number;
  reasoning: {
    pattern_match_details?: Record<string, any>;
    gl_mapping_logic?: Record<string, any>;
    ai_analysis?: string;
    validation_checks?: Record<string, any>;
  };
  approval_status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'AUTO_APPROVED';
  approved_by?: string;
  approved_at?: string;
  processing_batch_id?: string;
  ai_model?: string;
  processing_time_ms?: number;
  validation_checks?: Record<string, any>;
  error_details?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface WorkflowState {
  workflow_id?: string;
  batch_id: string;
  current_step: 1 | 2 | 3 | 4;
  total_transactions: number;
  processed_transactions: number;
  failed_transactions: number;
  step_1_completed_at?: string;
  step_2_completed_at?: string;
  step_3_completed_at?: string;
  step_4_completed_at?: string;
  human_approval_required: boolean;
  approval_checkpoint_step?: number;
  workflow_status: 'RUNNING' | 'COMPLETED' | 'FAILED' | 'PAUSED';
  error_details?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface AuditLogEntry {
  audit_id?: string;
  workflow_id?: string;
  transaction_id?: string;
  step_number: number;
  action_type: 'QUERY' | 'MATCH' | 'APPROVE' | 'REJECT' | 'AUTO_PROCESS';
  action_details: Record<string, any>;
  user_id?: string;
  ai_model?: string;
  confidence_score?: number;
  processing_time_ms?: number;
  input_data?: Record<string, any>;
  output_data?: Record<string, any>;
  error_details?: Record<string, any>;
  timestamp?: string;
}

// Query Builder Types
export interface QueryBuilder {
  select(columns: string[]): QueryBuilder;
  from(table: string): QueryBuilder;
  where(condition: string): QueryBuilder;
  orderBy(column: string, direction?: 'ASC' | 'DESC'): QueryBuilder;
  limit(count: number): QueryBuilder;
  offset(count: number): QueryBuilder;
  build(): string;
}

export interface BatchProcessingOptions {
  batchSize: number;
  concurrency: number;
  retryAttempts: number;
  retryDelay: number;
  onProgress?: (processed: number, total: number) => void;
  onError?: (error: Error, batch: any[], batchIndex: number) => void;
  onBatchComplete?: (results: any[], batchIndex: number) => void;
}

export interface WorkflowStep {
  stepNumber: 1 | 2 | 3 | 4;
  stepName: string;
  description: string;
  requiredApproval: boolean;
  autoApproveThreshold?: number;
  timeoutMs?: number;
  retryPolicy?: {
    maxAttempts: number;
    backoffMs: number;
  };
}

export interface CashClearingWorkflowConfig {
  steps: WorkflowStep[];
  batchProcessing: BatchProcessingOptions;
  approvalSettings: {
    requireHumanApproval: boolean;
    autoApproveThreshold: number;
    approvalTimeoutMs: number;
  };
  errorHandling: {
    maxRetries: number;
    escalationThreshold: number;
    notificationChannels: string[];
  };
}

// Error Types
export interface ProcessingError extends Error {
  code: string;
  step: number;
  transactionId?: string;
  batchId?: string;
  retryable: boolean;
  context?: Record<string, any>;
}

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  confidence: number;
  validationChecks: Record<string, boolean>;
}

// API Response Types
export interface WorkflowExecutionResult {
  workflowId: string;
  batchId: string;
  totalTransactions: number;
  processedTransactions: number;
  successfulTransactions: number;
  failedTransactions: number;
  averageConfidence: number;
  processingTimeMs: number;
  stepResults: {
    step1: { completed: boolean; count: number; timeMs: number };
    step2: { completed: boolean; count: number; timeMs: number };
    step3: { completed: boolean; count: number; timeMs: number };
    step4: { completed: boolean; count: number; timeMs: number };
  };
  errors: ProcessingError[];
  requiresApproval: boolean;
  pendingApprovals: number;
}

export interface ApprovalRequest {
  suggestionId: string;
  transactionId: string;
  currentApprovalStatus: string;
  newApprovalStatus: 'APPROVED' | 'REJECTED';
  approvedBy: string;
  approvalReason?: string;
  metadata?: Record<string, any>;
}

// BigQuery Query Result Types
export interface TransactionQueryResult {
  transaction_id: string;
  description: string;
  transaction_date: string;
  account_id: string;
  currency_code: string;
  reference_number: string;
}

export interface ApprovalQueryResult extends CashClearingSuggestion {
  // Additional fields from query joins
  transaction_details?: TransactionQueryResult;
  pattern_details?: ProcessorPattern;
  gl_mapping_details?: GLPattern;
}