# Simple Docker Setup

## Quick Start

1. **Create `.env` file**:
   ```bash
   cp .env.example .env
   ```
   Edit `.env` with your actual API keys and GCP project details.

2. **Build and run**:
   ```bash
   docker-compose up
   ```

## What it does

- Runs `pattern-matcher-cli.js` in a container
- Mounts your GCP credentials and results directory
- Uses your `.env` file for configuration

## To run different commands

```bash
# Run the main app
docker-compose run app node src/index.js

# Run batch processing
docker-compose run app node pattern-matcher-batch.js

# Run with custom command
docker-compose run app node test-v7-processor.js
```

## Deploy to GCP Cloud Run

```bash
# Build the image
docker build -t gcr.io/YOUR_PROJECT_ID/pattern-matcher .

# Push to GCP
docker push gcr.io/YOUR_PROJECT_ID/pattern-matcher

# Deploy to Cloud Run
gcloud run deploy pattern-matcher \
  --image gcr.io/YOUR_PROJECT_ID/pattern-matcher \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated
```