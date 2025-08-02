# AI Financial Chat Interface

## Overview

This is a Next.js-based chatbot interface that allows you to interact with your BigQuery financial data using natural language. It uses the Vercel AI SDK with streaming support and Generative UI features to provide real-time, visual responses.

## Features

- **Natural Language Queries**: Ask questions about your financial data in plain English
- **Real-time Streaming**: See responses as they're generated
- **Generative UI**: Dynamic React components generated based on data
- **Visual Data Display**: 
  - Transaction tables with filtering and sorting
  - Statistics cards with trends
  - Visual charts for transaction processing trends
- **BigQuery Integration**: Direct connection to your BigQuery data via MCP

## Getting Started

### Prerequisites

1. Make sure you have a valid OpenAI API key
2. Ensure BigQuery credentials are properly configured in `.env`

### Running the Chatbot

1. First, ensure all dependencies are installed:
```bash
npm install
```

2. Update your `.env` or `.env.local` file with a valid OpenAI API key:
```
OPENAI_API_KEY=sk-your-actual-api-key-here
```

3. Start the Next.js development server:
```bash
npm run dev
```

4. Open your browser and navigate to:
```
http://localhost:3000
```

## Example Queries

You can ask questions like:

- "Show me all unmatched transactions from yesterday"
- "What's the success rate for cash clearing this week?"
- "Find transactions with amount greater than $10,000"
- "Show me transaction statistics for the last month"
- "Display transactions with status T_NOT_FOUND"
- "What are the processing trends for the last 7 days?"

## Architecture

```
Frontend (Next.js)              API Routes                 Backend Services
┌─────────────────┐           ┌──────────────┐          ┌──────────────────┐
│  Chat UI        │ ────────> │ /api/chat    │ ───────> │ BigQuery MCP     │
│  - useChat hook │           │ - streamText │          │ - Query tools    │
│  - Streaming    │ <──────── │ - Tools      │ <─────── │ - Data access    │
│  - Generative UI│           │ - UI Stream  │          └──────────────────┘
└─────────────────┘           └──────────────┘
```

## Available Tools

### 1. Query Transactions
- Search transactions by status, date range, amount, or merchant
- Returns interactive transaction tables

### 2. Get Transaction Stats
- Provides overview statistics with visual cards
- Shows trends with bar charts
- Calculates success rates and averages

### 3. Search Unmatched
- Finds transactions that need attention
- Highlights retry counts and confidence scores
- Helps identify problematic transactions

## Customization

### Adding New Tools

To add new BigQuery tools, edit `lib/bigquery-tools.tsx`:

```typescript
export const bigQueryTools = {
  yourNewTool: tool({
    description: 'Description of what this tool does',
    inputSchema: z.object({
      // Define input parameters
    }),
    execute: async (args, { mcpClient }) => {
      // Execute BigQuery query
      // Return React component
    },
  }),
};
```

### Modifying UI Components

UI components are located in `components/bigquery/`:
- `TransactionTable.tsx` - Table display for transactions
- `StatsCard.tsx` - Statistics display cards
- `TransactionChart.tsx` - Chart visualizations

## Troubleshooting

### "Failed to connect to BigQuery MCP server"
- Check your BigQuery credentials in `.env`
- Ensure the service account has proper permissions

### "No OpenAI API key found"
- Add your OpenAI API key to `.env` or `.env.local`
- Restart the Next.js server after updating

### Chat not responding
- Check browser console for errors
- Ensure the API route is accessible at `/api/chat`
- Verify OpenAI API key is valid

## Development Tips

1. **Hot Reload**: The Next.js dev server supports hot module replacement
2. **Type Safety**: Full TypeScript support for all components
3. **Tailwind CSS**: Use Tailwind classes for styling
4. **Error Boundaries**: Components are wrapped in error boundaries for resilience

## Production Deployment

Before deploying to production:

1. Set production environment variables
2. Run build to check for errors:
   ```bash
   npm run build
   ```
3. Consider connection pooling for BigQuery MCP
4. Implement rate limiting for API endpoints
5. Add authentication/authorization as needed