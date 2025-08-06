# FinTool v0.1.0 - Initial Release

## 🎉 Release Overview
First production release of FinTool - an AI-powered cash transaction pattern matching system for BigQuery. This tool helps identify patterns in unmatched cash transactions and suggests appropriate GL accounts.

## 🚀 What's New
- **Dockerized Application**: Fully containerized application for easy deployment
- **Batch Processing**: Process large volumes of transactions efficiently 
- **Local Pattern Matching**: Fast pattern matching without API calls
- **AI-Powered Analysis**: Optional OpenRouter/OpenAI integration for complex patterns
- **BigQuery Integration**: Direct connection to BigQuery datasets via MCP
- **CSV Export**: Results exported to timestamped CSV files

## 📦 Download
Download the Docker image: `fintool-0.1.0.tar.gz` (188MB)

## 🛠️ Installation & Setup

### 1. Load the Docker Image
```bash
docker load < fintool-0.1.0.tar.gz
```

### 2. Create Configuration File
Create a `.env` file with your credentials:

```env
# Required Configuration
GCP_PROJECT_ID=your-gcp-project-id
GCP_LOCATION=us
CASH_CLEARING_DATASET=your-dataset-name
OPENROUTER_API_KEY=your-api-key

# Model Configuration
OPENROUTER_MODEL=openai/gpt-4o-mini

# Optional Settings
PATTERN_BATCH_SIZE=5
PATTERN_CONCURRENCY=5
USE_LOCAL_PATTERN_MATCHING=true
```

### 3. Add GCP Service Account Key
Save your GCP service account JSON key as `gcp.json` in your working directory.

## 🏃 Running the Application

### Default Mode
Processes 100 transactions in batches of 5:
```bash
docker run --env-file .env \
  -e GCP_KEY_FILE_PATH=/app/gcp-key.json \
  -v $(pwd)/gcp.json:/app/gcp-key.json:ro \
  -v $(pwd)/results:/app/results \
  fintool:0.1.0
```

### Custom Parameters
Process more transactions with different batch sizes:
```bash
# Process 1000 transactions in batches of 10
docker run --env-file .env \
  -e GCP_KEY_FILE_PATH=/app/gcp-key.json \
  -v $(pwd)/gcp.json:/app/gcp-key.json:ro \
  -v $(pwd)/results:/app/results \
  fintool:0.1.0 batch --batch-size 10 --limit 1000

# Process all transactions with higher concurrency
docker run --env-file .env \
  -e GCP_KEY_FILE_PATH=/app/gcp-key.json \
  -v $(pwd)/gcp.json:/app/gcp-key.json:ro \
  -v $(pwd)/results:/app/results \
  fintool:0.1.0 batch --batch-size 50 --concurrency 10 --limit 50000
```

### Other Run Modes
```bash
# Run single pattern matching analysis (CLI mode)
docker run --env-file .env \
  -e GCP_KEY_FILE_PATH=/app/gcp-key.json \
  -v $(pwd)/gcp.json:/app/gcp-key.json:ro \
  -v $(pwd)/results:/app/results \
  fintool:0.1.0 cli

# Execute direct BigQuery queries
docker run --env-file .env \
  -e GCP_KEY_FILE_PATH=/app/gcp-key.json \
  -v $(pwd)/gcp.json:/app/gcp-key.json:ro \
  -v $(pwd)/results:/app/results \
  fintool:0.1.0 query "SELECT COUNT(*) FROM dataset.table"
```

## 📊 Output
- Results saved to `./results/pattern_batch_YYYY-MM-DD_HH-MM-SS.csv`
- CSV includes: transaction ID, text, amount, currency, pattern matches, GL accounts, confidence scores

## 🔧 Configuration Options

### Environment Variables
- `PATTERN_BATCH_SIZE`: Number of transactions per batch (default: 5)
- `PATTERN_CONCURRENCY`: Parallel processing threads (default: 5)
- `USE_LOCAL_PATTERN_MATCHING`: Use local rules (true) or AI (false)
- `PATTERN_MAX_DAILY_LIMIT`: Maximum transactions per run (default: 50000)

### Command Line Options
- `--batch-size`: Override batch size
- `--concurrency`: Override concurrency
- `--limit`: Maximum number of transactions to process
- `--dry-run`: Preview what would be processed without executing

## 🐛 Known Issues
- Initial startup may take 30-60 seconds for BigQuery connection
- Large batch sizes (>100) may cause memory issues

## 🔮 Future Enhancements
- Web UI for monitoring progress
- Real-time pattern matching API
- Support for multiple datasets
- Advanced pattern configuration

## 📝 License
MIT License

---
For issues or questions, please open an issue on GitHub.