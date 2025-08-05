#!/bin/sh
set -e

# Function to check if required environment variables are set
check_env() {
    if [ -z "$1" ]; then
        echo "Error: $2 is not set"
        exit 1
    fi
}

# Validate required environment variables
check_env "$GCP_PROJECT_ID" "GCP_PROJECT_ID"
check_env "$CASH_CLEARING_DATASET" "CASH_CLEARING_DATASET"

# Check if GCP key file exists
if [ ! -f "$GCP_KEY_FILE_PATH" ]; then
    echo "Error: GCP key file not found at $GCP_KEY_FILE_PATH"
    echo "Please mount your service account JSON file to /app/gcp-key.json"
    exit 1
fi

# Create directories if they don't exist
mkdir -p "$PATTERN_OUTPUT_DIR" "$LOG_DIR"

# Handle different run modes based on first argument
case "$1" in
    "batch")
        shift
        exec node pattern-matcher-batch.js "$@"
        ;;
    "query")
        shift
        exec node BigQueryUtil.js "$@"
        ;;
    "scheduler")
        exec node src/index.js
        ;;
    "cli")
        shift
        exec node pattern-matcher-cli.js "$@"
        ;;
    "node")
        # Allow running any node command
        exec "$@"
        ;;
    *)
        # Default: run pattern matcher CLI
        exec node pattern-matcher-cli.js "$@"
        ;;
esac