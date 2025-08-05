# FinTool Docker Quick Start Guide

## Prerequisites
- Docker installed on your system
- GCP service account JSON key file
- Access to BigQuery dataset

## Setup Instructions

### 1. Load the Docker Image
```bash
docker load < fintool-1.0.0.tar.gz
```

### 2. Create Configuration File
Create a `.env` file with your credentials:

```bash
# Required Configuration
GCP_PROJECT_ID=your-gcp-project-id
GCP_LOCATION=us
CASH_CLEARING_DATASET=your-dataset-name
OPENROUTER_API_KEY=your-openrouter-api-key

# Model Configuration (use one of these)
OPENROUTER_MODEL=openai/gpt-4o-mini
# Other options: anthropic/claude-3.5-sonnet, openai/gpt-4o

# Optional: Adjust batch processing settings
PATTERN_BATCH_SIZE=5
PATTERN_CONCURRENCY=5
USE_LOCAL_PATTERN_MATCHING=true  # Set to false to use AI
```

### 3. Add Your GCP Key
Place your GCP service account JSON file in the current directory and name it `gcp.json`

### 4. Run the Container

**Default mode** (processes 100 transactions in batches of 5):
```bash
docker run --env-file .env \
  -e GCP_KEY_FILE_PATH=/app/gcp-key.json \
  -v $(pwd)/gcp.json:/app/gcp-key.json:ro \
  -v $(pwd)/results:/app/results \
  fintool
```

**Custom parameters**:
```bash
# Process 1000 transactions in batches of 20
docker run --env-file .env \
  -e GCP_KEY_FILE_PATH=/app/gcp-key.json \
  -v $(pwd)/gcp.json:/app/gcp-key.json:ro \
  -v $(pwd)/results:/app/results \
  fintool batch --batch-size 20 --limit 1000
```

**Using Docker Compose** (if docker-compose.prod.yml is provided):
```bash
docker-compose -f docker-compose.prod.yml up
```

## Output
- Results are saved in the `./results` directory
- Files are named with timestamps: `pattern_batch_YYYY-MM-DD_HH-MM-SS.csv`
- Each CSV contains transaction details and pattern matching results

## Troubleshooting

**Container exits immediately**
- Check if `.env` file exists and has correct values
- Verify `gcp.json` file exists in current directory
- Run with logs: `docker logs <container-id>`

**Permission denied**
- Ensure the results directory is writable: `chmod 755 results`

**Invalid API key errors**
- Verify your OPENROUTER_API_KEY is correct
- Check the model name matches exactly (e.g., `openai/gpt-4o-mini`)