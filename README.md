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
```

## Scripts

- `npm start` - Run the main processor
- `npm run pattern-match` - Run pattern matching analysis
- `npm run dev` - Run with file watching for development

## Project Structure

```
├── pattern-matcher-cli.js    # Main pattern matching CLI tool
├── src/
│   ├── index.js             # Main entry point
│   ├── processors/          # Processing logic
│   ├── services/            # Service integrations
│   └── utils/               # Utility functions
├── docs/                    # Documentation
└── .env                     # Environment configuration
```

## License

MIT