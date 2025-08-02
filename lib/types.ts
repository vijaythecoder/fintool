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