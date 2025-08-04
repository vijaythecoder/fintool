# AI Cash Clearing Resolution System (CLI)

An AI-powered command-line tool for analyzing and resolving unmatched cash transactions using pattern matching with BigQuery and OpenAI.

## Overview

This system implements a 4-step process to identify patterns in cash transactions marked as 'T_NOTFOUND' and suggest appropriate GL accounts and pattern classifications.

## Features

- 🔍 Pattern matching for unmatched cash transactions
- 🤖 AI-powered transaction analysis using OpenAI GPT-4
- 📊 BigQuery integration via Model Context Protocol (MCP)
- 🎯 Automatic GL account and FT_ID determination
- 📝 Detailed confidence scoring and reasoning
- 💾 CSV export of results with customizable filenames
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

🔄 Processing transactions...

| bt_id | AI_SUGGEST_TEXT | AI_CONFIDENCE_SCORE | AI_REASON | AI_GL_ACCOUNT | AI_PRCSSR_PTRN_FT | UPDATED_AT |
|-------|-----------------|---------------------|-----------|---------------|-------------------|------------|
| 12345 | INCOME          | 0.95                | 'INTEREST' found in text | 421025 | BANK_0649 | CURRENT_TIMESTAMP |

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

## Scripts

- `npm start` - Run the main processor
- `npm run pattern-match` - Run pattern matching analysis
- `npm run dev` - Run with file watching for development
- `node BigQueryUtil.js "<query>"` - Execute BigQuery queries directly

## Project Structure

```
├── pattern-matcher-cli.js    # Main pattern matching CLI tool
├── BigQueryUtil.js          # BigQuery query execution utility
├── src/
│   ├── index.js             # Main entry point
│   ├── processors/          # Processing logic
│   ├── services/            # Service integrations
│   └── utils/               # Utility functions
├── results/                 # CSV output directory (auto-created)
│   └── queries/             # BigQuery query results
├── docs/                    # Documentation
└── .env                     # Environment configuration
```

## License

MIT