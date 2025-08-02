#!/bin/bash

echo "🚀 Setting up AI-Enhanced Cash Clearing Resolution System..."
echo ""

# Check Node.js version
NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
if [ "$NODE_VERSION" -lt 18 ]; then
    echo "❌ Error: Node.js 18.0.0 or higher is required"
    echo "   Current version: $(node -v)"
    exit 1
fi
echo "✅ Node.js version check passed"

# Create logs directory
mkdir -p logs
echo "✅ Created logs directory"

# Copy environment file if not exists
if [ ! -f .env ]; then
    cp .env.example .env
    echo "✅ Created .env file from .env.example"
    echo "⚠️  Please edit .env and add your configuration values"
else
    echo "✅ .env file already exists"
fi

# Install dependencies
echo ""
echo "📦 Installing dependencies..."
npm install

echo ""
echo "✅ Setup complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env file with your configuration"
echo "2. Ensure your BigQuery dataset and tables are set up"
echo "3. Run 'npm run run-now' to test the system"
echo "4. Run 'npm start' to start the scheduled service"
echo ""
echo "For more information, see README.md"