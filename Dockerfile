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

# Run the pattern matcher CLI by default
CMD ["node", "pattern-matcher-cli.js"]