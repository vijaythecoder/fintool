# AI-Enhanced Cash Clearing Resolution System

An intelligent financial transaction processing system that uses AI to automatically resolve unmatched cash clearing transactions, reducing manual intervention by up to 80% and accelerating reconciliation from days to hours.

## Overview

This system serves as an intelligent second layer for cash clearing operations, handling millions of daily transactions that couldn't be automatically matched by rule-based systems. It connects to BigQuery through MCP (Model Context Protocol) and uses advanced language models to:

- Analyze unmatched transactions marked as `T_NOT_FOUND`
- Find potential matches using contextual clues
- Learn from historical resolution patterns
- Either resolve transactions automatically or enrich them for human review

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Scheduler     │────▶│  Node.js App     │────▶│ BigQuery MCP    │
│  (cron/systemd) │     │  with AI SDK     │ MCP │    Server       │
└─────────────────┘     │                  │     └────────┬────────┘
                        │ • FinancialProc. │              │
                        │ • AdvancedProc.  │              ▼
                        │ • Error Handling │         ┌─────────┐
                        └──────────────────┘         │ BigQuery│
                                                     └─────────┘
```

## Features

- **AI-Powered Matching**: Uses GPT-4 to understand complex transaction patterns
- **Confidence Scoring**: Calculates match confidence based on multiple criteria
- **Batch Processing**: Efficiently processes transactions in configurable batches
- **Retry Logic**: Automatic retry with exponential backoff for failed transactions
- **Comprehensive Logging**: Detailed logs for debugging and audit trails
- **Flexible Scheduling**: Cron-based scheduling with timezone support
- **Two Processing Modes**:
  - Standard: Fully AI-driven orchestration
  - Advanced: Custom logic with granular control

## Prerequisites

- Node.js 18.0.0 or higher
- Google Cloud Platform account with BigQuery access
- OpenAI API key
- Service account with BigQuery permissions

## Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd ai-cash-clearing-resolution
```

2. Install dependencies:
```bash
npm install
```

3. Copy environment configuration:
```bash
cp .env.example .env
```

4. Configure your environment variables in `.env`:
```bash
# Required configurations
GCP_PROJECT_ID=your-project-id
GCP_KEY_FILE_PATH=/path/to/service-account-key.json
OPENAI_API_KEY=your-openai-api-key
```

## BigQuery Schema Requirements

Your BigQuery dataset should have the following tables:

### `unmatched_transactions`
```sql
CREATE TABLE unmatched_transactions (
  transaction_id STRING,
  amount NUMERIC,
  reference_number STRING,
  merchant_name STRING,
  transaction_date DATE,
  original_description STRING,
  status STRING,
  retry_count INT64,
  processed_timestamp TIMESTAMP,
  match_confidence FLOAT64,
  matched_transaction_id STRING,
  enrichment_notes STRING
);
```

### `all_transactions`
```sql
CREATE TABLE all_transactions (
  transaction_id STRING,
  amount NUMERIC,
  reference_number STRING,
  merchant_name STRING,
  transaction_date DATE,
  status STRING
);
```

### `processing_log`
```sql
CREATE TABLE processing_log (
  processing_date DATE,
  processing_method STRING,
  total_processed INT64,
  matched_count INT64,
  enriched_count INT64,
  failed_count INT64,
  avg_confidence FLOAT64,
  processing_time_ms INT64,
  items_per_second FLOAT64,
  timestamp TIMESTAMP
);
```

## Usage

### Running Once
```bash
npm run run-now
```

### Running with specific date
```bash
npm run run-now -- --date=2024-12-15
```

### Running as scheduled service
```bash
npm start
```

### Development mode with auto-reload
```bash
npm run dev
```

## Configuration Options

### Processing Modes

1. **Standard Mode** (default):
   - AI handles all BigQuery operations
   - Minimal configuration required
   - Best for straightforward matching scenarios

2. **Advanced Mode**:
   - Custom orchestration logic
   - Parallel processing support
   - Fine-grained control over matching rules

Set via `PROCESSOR_TYPE` environment variable.

### Matching Rules (Advanced Mode)

Configure custom matching weights:
```javascript
{
  exactAmount: { weight: 0.3, tolerance: 0 },
  referenceNumber: { weight: 0.4, minSimilarity: 0.8 },
  dateRange: { weight: 0.2, maxDaysDiff: 3 },
  merchantName: { weight: 0.1, minSimilarity: 0.7 }
}
```

### Confidence Threshold

Transactions are automatically matched when confidence >= threshold (default: 0.85).
Configure via `CONFIDENCE_THRESHOLD` environment variable.

## Monitoring

### Logs
- Console output for development
- File logs for production (error.log, combined.log)
- Structured JSON logging with Winston

### Metrics
The system tracks:
- Total transactions processed
- Match success rate
- Processing time per batch
- Items processed per second

### Notifications
Optional webhook notifications for processing status:
```bash
NOTIFICATION_WEBHOOK=https://your-webhook-url.com/notifications
```

## Performance Optimization

- **Batch Size**: Adjust `BATCH_SIZE` based on your transaction volume
- **Concurrency**: Set `CONCURRENCY` for parallel processing (Advanced mode)
- **AI Model**: Choose between gpt-4-turbo (default) or gpt-3.5-turbo for cost/performance trade-off

## Troubleshooting

### Common Issues

1. **MCP Connection Failed**
   - Verify GCP credentials path
   - Check service account permissions
   - Ensure BigQuery API is enabled

2. **Low Match Rate**
   - Review confidence threshold
   - Check data quality in source tables
   - Analyze enrichment notes for patterns

3. **Performance Issues**
   - Reduce batch size
   - Enable concurrent processing
   - Check BigQuery query performance

## Security

- Service account keys should be stored securely
- Never commit `.env` or credential files
- Use least-privilege permissions for service accounts
- Enable audit logging in BigQuery

## Contributing

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Support

For issues and feature requests, please create an issue in the repository.