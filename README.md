# AI Cash Clearing Resolution System (CLI)

An AI-powered command-line tool for analyzing and resolving unmatched cash transactions using pattern matching with BigQuery and OpenAI.

## Overview

This system implements a 4-step process to identify patterns in cash transactions marked as 'T_NOTFOUND' and suggest appropriate GL accounts and pattern classifications.

## Features

- 🔍 Pattern matching for unmatched cash transactions
- 🤖 AI-powered transaction analysis using configurable OpenAI models
- 📊 BigQuery integration via Model Context Protocol (MCP)
- 🎯 Automatic GL account and FT_ID determination
- 📝 Detailed confidence scoring and reasoning
- 💾 CSV export with transaction details (text, amount, currency)
- 📁 Organized results storage with timestamp tracking

## Prerequisites

- Node.js 18+ 
- Google Cloud Platform account with BigQuery access
- OpenAI API key
- BigQuery service account credentials

## Installation

1. Clone the repository:
```bash
git clone https://github.com/vijaythecoder/fintool.git
cd fintool
```

2. Install dependencies:
```bash
npm install
```

3. Configure environment variables:
```bash
cp .env.example .env
```

Edit `.env` with your credentials:
```env
# GCP Configuration
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us
GCP_KEY_FILE_PATH=/path/to/service-account-key.json

# BigQuery Dataset
CASH_CLEARING_DATASET=your-dataset-name

# OpenAI Configuration
OPENAI_API_KEY=your-openai-api-key
OPENAI_MODEL=gpt-4.1  # Options: gpt-4.1, gpt-4.1-mini, gpt-4o, gpt-4o-mini, gpt-4-turbo
```

## Usage

### Pattern Matching CLI

Run the pattern matcher to analyze unmatched transactions:

```bash
npm run pattern-match
```

Or directly:

```bash
node pattern-matcher-cli.js
```

#### Command Line Options

- `--output, -o <filename>` - Specify a custom output filename (saved in results/ directory)
- `--help, -h` - Show help message

#### Examples

```bash
# Run with default timestamped filename
node pattern-matcher-cli.js

# Run with custom output filename
node pattern-matcher-cli.js --output my-analysis

# Show help
node pattern-matcher-cli.js --help
```

### How It Works

The pattern matcher follows a 4-step process:

1. **Query Unmatched Transactions**: Retrieves transactions where `pattern='T_NOTFOUND'`
2. **Pattern Matching**: Matches transaction text against pattern definitions
3. **GL Account Determination**: Identifies appropriate GL accounts and FT_IDs
4. **Results Display**: Shows analysis with confidence scores and reasoning

### Example Output

```
🔍 Cash Transaction Pattern Matching Processor

📊 Connecting to BigQuery...
✅ Connected to BigQuery

📋 Dataset: ksingamsetty-test.AI_POC
🤖 Model: gpt-4.1

🔄 Processing transactions...

| bt_id | text | amount | currency | AI_SUGGEST_TEXT | AI_CONFIDENCE_SCORE | AI_REASON | AI_GL_ACCOUNT | AI_PRCSSR_PTRN_FT | UPDATED_AT |
|-------|------|--------|----------|-----------------|---------------------|-----------|---------------|-------------------|------------|
| 12345 | BANK INTEREST CREDIT | 125.50 | USD | INCOME | 0.95 | 'INTEREST' found in text | 421025 | BANK_0649 | CURRENT_TIMESTAMP |

✅ Successfully extracted results data

💾 Results saved to: results/pattern_matches_2025-08-04T12-30-45.csv
   Total records: 10
```

### BigQuery Utility Tool

Execute any BigQuery SQL query directly from the command line:

```bash
# Basic query
node BigQueryUtil.js "SELECT * FROM ksingamsetty-test.AI_POC.cash_transactions LIMIT 10"

# Query with CSV export
node BigQueryUtil.js "SELECT bt_id, text, pattern FROM ksingamsetty-test.AI_POC.cash_transactions WHERE pattern='T_NOTFOUND' LIMIT 20" --csv

# Count query
node BigQueryUtil.js "SELECT COUNT(*) as total FROM ksingamsetty-test.AI_POC.cash_transactions"

# Complex query with joins
node BigQueryUtil.js "SELECT t.*, p.pattern_op FROM dataset.transactions t JOIN dataset.patterns p ON t.pattern = p.pattern_code"
```

#### BigQuery Utility Options

- `--csv` - Save query results to CSV file in `results/queries/` directory
- `--help, -h` - Show help message

The tool automatically:
- Connects to BigQuery using MCP
- Executes your exact SQL query
- Displays results in table format
- Optionally saves to CSV with timestamps
- Saves the original query for reference

### Batch Processing for Large Datasets

For processing millions of transactions efficiently, use the batch processing mode:

```bash
# Process with default settings
npm run pattern-match-batch

# Process with custom batch size and concurrency
node pattern-matcher-batch.js --batch-size 200 --concurrency 5

# Process with limit
node pattern-matcher-batch.js --limit 100000

# Dry run to see what would be processed
node pattern-matcher-batch.js --dry-run

# Use AI instead of local pattern matching
node pattern-matcher-batch.js --use-ai
```

#### Batch Processing Features

- **Efficient Processing**: Handles millions of transactions without memory issues
- **Progress Tracking**: Real-time progress updates with ETA
- **Resumable**: Automatically saves checkpoints for recovery
- **Configurable Batching**: Adjust batch size and concurrency
- **Daily Limits**: Prevent excessive processing with configurable limits
- **CSV Streaming**: Write results directly to CSV without memory overhead

#### Batch Configuration

Configure batch processing in your `.env` file:

```env
# Batch Processing
PATTERN_BATCH_SIZE=100          # Transactions per batch
PATTERN_CONCURRENCY=3           # Parallel batches
PATTERN_MAX_DAILY_LIMIT=50000   # Daily limit
PATTERN_OUTPUT_DIR=./results    # Output directory
USE_LOCAL_PATTERN_MATCHING=true # Use local rules (fast) or AI
```

#### Automated Daily Processing

Enable automated daily processing with cron:

```env
# Cron Job Configuration
PATTERN_MATCHING_ENABLED=true
PATTERN_CRON_SCHEDULE=0 3 * * *  # Daily at 3 AM
```

The system will automatically:
- Run daily at the scheduled time
- Process up to the daily limit
- Generate CSV reports in the results directory
- Send notifications on completion (if configured)

#### Performance Benchmarks

With default settings:
- **Local Pattern Matching**: ~5,000 transactions/minute
- **AI Pattern Matching**: ~500 transactions/minute
- **Memory Usage**: < 500MB regardless of dataset size
- **CSV Writing**: Streaming (no memory limit)

## Scripts

- `npm start` - Run the main processor with cron scheduler
- `npm run pattern-match` - Run pattern matching analysis (interactive mode)
- `npm run pattern-match-batch` - Run batch pattern matching for large datasets
- `npm run dev` - Run with file watching for development
- `node BigQueryUtil.js "<query>"` - Execute BigQuery queries directly

## Project Structure

```
├── pattern-matcher-cli.js    # Interactive pattern matching CLI
├── pattern-matcher-batch.js  # Batch processing CLI for large datasets
├── BigQueryUtil.js          # BigQuery query execution utility
├── src/
│   ├── index.js             # Main entry point with cron scheduler
│   ├── processors/
│   │   ├── batchPatternProcessor.js    # Batch processing engine
│   │   ├── patternMatchingService.js   # Core pattern matching logic
│   │   └── advancedProcessor.js        # Advanced financial processor
│   ├── services/
│   │   └── mcpClient.js               # BigQuery MCP integration
│   ├── jobs/
│   │   └── patternMatchingJob.js      # Cron job for automated processing
│   └── utils/
│       ├── csvStreamer.js             # Streaming CSV writer
│       ├── progressTracker.js         # Progress tracking & checkpoints
│       ├── chunks.js                  # Batch processing utilities
│       └── logger.js                  # Winston logging
├── results/                 # Output directory (auto-created)
│   ├── pattern_matches_*.csv          # Pattern matching results
│   ├── queries/                       # BigQuery query results
│   └── progress/                      # Progress checkpoints
├── docs/                    # Documentation
└── .env                     # Environment configuration
```

## License

MIT