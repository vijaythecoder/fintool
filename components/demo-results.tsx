'use client';

import { BigQueryResultDisplay } from './bigquery-result-display';

// Demo data to showcase different BigQuery result types
export const demoResults = {
  schemaResult: {
    content: JSON.stringify([
      {
        "column_name": "BT_ID",
        "data_type": "STRING",
        "is_nullable": "NO",
        "description": "Unique identifier for bank transfer"
      },
      {
        "column_name": "AMOUNT",
        "data_type": "NUMERIC",
        "is_nullable": "YES",
        "description": "Transaction amount in USD"
      },
      {
        "column_name": "TRANSACTION_DATE",
        "data_type": "TIMESTAMP",
        "is_nullable": "NO",
        "description": "Date and time of transaction"
      },
      {
        "column_name": "STATUS",
        "data_type": "STRING",
        "is_nullable": "YES",
        "description": "Current status of the transaction"
      }
    ]),
    isError: false
  },

  transactionResult: {
    content: JSON.stringify([
      {
        "transaction_id": "TXN_001",
        "transaction_amount": 1250.75,
        "customer_account": "ACC_12345",
        "transaction_date": "2024-08-02T10:30:00Z",
        "status": "COMPLETED"
      },
      {
        "transaction_id": "TXN_002", 
        "transaction_amount": 5000.00,
        "customer_account": "ACC_67890",
        "transaction_date": "2024-08-02T11:15:00Z",
        "status": "PENDING"
      }
    ]),
    isError: false
  },

  queryStatsResult: {
    content: JSON.stringify({
      "total_transactions": 1250,
      "total_amount": 2500000.00,
      "success_rate": 0.95,
      "avg_processing_time_minutes": 12.5,
      "last_updated": "2024-08-02T12:00:00Z"
    }),
    isError: false
  },

  errorResult: {
    content: "Query timeout: The operation exceeded the maximum allowed execution time of 300 seconds.",
    isError: true
  }
};

interface DemoResultsProps {
  onClose: () => void;
}

export function DemoResults({ onClose }: DemoResultsProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
      <div className="bg-white dark:bg-gray-900 rounded-lg max-w-4xl max-h-[90vh] w-full overflow-y-auto">
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 p-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">
            BigQuery Result Display Examples
          </h2>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        
        <div className="p-6 space-y-8">
          <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Schema Information Display
            </h3>
            <BigQueryResultDisplay output={demoResults.schemaResult} toolName="describe-table" />
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Transaction Data Results
            </h3>
            <BigQueryResultDisplay output={demoResults.transactionResult} toolName="query-transactions" />
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Query Statistics Object
            </h3>
            <BigQueryResultDisplay output={demoResults.queryStatsResult} toolName="get-stats" />
          </div>

          <div>
            <h3 className="text-lg font-semibold mb-4 text-gray-900 dark:text-white">
              Error Display
            </h3>
            <BigQueryResultDisplay output={demoResults.errorResult} toolName="query-data" />
          </div>
        </div>
      </div>
    </div>
  );
}