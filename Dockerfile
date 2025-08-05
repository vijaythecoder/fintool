# Simple Dockerfile for Node.js application
FROM node:20-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy all application files
COPY . .

# Create results directory for output
RUN mkdir -p results logs

# Run the pattern matcher batch processor by default
CMD ["node", "pattern-matcher-batch.js", "--batch-size", "5", "--concurrency", "5", "--limit", "100"]