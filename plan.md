## Project Description: AI-Enhanced Cash Clearing Resolution System

This financial transaction processing system serves as an intelligent second layer for cash clearing operations, handling millions of daily transactions that couldn't be automatically matched by rule-based systems. In typical cash clearing workflows, transactions flow through primary reconciliation engines that apply predefined business rules to match payments with their corresponding entries. However, a significant volume of transactions (often 5-15%) fail these rule-based matches and are marked as `T_NOT_FOUND`, requiring manual investigation that can take days and incur substantial operational costs. Our AI-powered solution addresses this challenge by automatically analyzing these unmatched transactions using advanced language models that can understand complex transaction patterns, identify potential matches based on contextual clues (partial reference numbers, similar amounts with timing offsets, merchant name variations), and learn from historical resolution patterns. By connecting directly to BigQuery through MCP (Model Context Protocol), the system queries unprocessed transactions, applies intelligent pattern recognition and probabilistic matching, and either resolves transactions automatically with high confidence or enriches them with actionable insights for human review. This approach reduces manual intervention by up to 80%, accelerates cash reconciliation from days to hours, and continuously improves accuracy through feedback loops - ultimately transforming what was once a labor-intensive back-office function into an efficient, scalable operation that directly impacts working capital and customer satisfaction.

## Architecture Overview: Vercel AI SDK + BigQuery MCP

Based on the documentation, here's how Vercel AI SDK connects to MCP servers:

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Scheduler     │────▶│  Your Node App   │────▶│ BigQuery MCP    │
│  (cron/systemd) │     │  with AI SDK     │ MCP │    Server       │
└─────────────────┘     │                  │     └────────┬────────┘
                        │ 1. Connect to MCP│              │
                        │ 2. Get tools     │              │
                        │ 3. AI processes  │              ▼
                        │ 4. Use BQ tools  │         ┌─────────┐
                        └──────────────────┘         │ BigQuery│
                                                     └─────────┘
```

## Implementation with Vercel AI SDK + MCP

### 1. **Connect to BigQuery MCP Server**
```javascript
// src/services/mcpClient.js
import { experimental_createMCPClient as createMCPClient } from 'ai';

export async function getBigQueryTools() {
  // Connect to your BigQuery MCP server
  const client = await createMCPClient({
    transport: {
      type: 'stdio',  // for local MCP server
      command: 'npx',
      args: [
        '-y',
        '@ergut/mcp-bigquery-server',  // or your BigQuery MCP package
        '--project-id', process.env.GCP_PROJECT_ID,
        '--location', process.env.GCP_LOCATION,
        '--key-file', process.env.GCP_KEY_FILE_PATH
      ]
    }
  });

  // Get available tools from BigQuery MCP
  const tools = await client.tools();
  return { client, tools };
}
```

### 2. **Main Processor Using AI SDK with MCP Tools**
```javascript
// src/processors/financialProcessor.js
import { generateText } from '@vercel/ai';
import { openai } from '@vercel/ai/openai';
import { getBigQueryTools } from '../services/mcpClient.js';

export class FinancialProcessor {
  async processFinancialData() {
    // Step 1: Get BigQuery MCP tools
    const { client, tools } = await getBigQueryTools();
    
    // Step 2: Use AI with BigQuery tools
    const result = await generateText({
      model: openai('gpt-4-turbo'),
      messages: [
        {
          role: 'system',
          content: `You are a financial analyst with access to BigQuery. 
                   Analyze yesterday's transactions and categorize them.`
        },
        {
          role: 'user',
          content: `Please:
            1. Query yesterday's unprocessed transactions
            2. Analyze and categorize each transaction
            3. Write the results back to the processed_transactions table`
        }
      ],
      tools: tools,  // BigQuery MCP tools are automatically available
      maxSteps: 10,  // Allow multiple tool calls
    });

    // The AI will automatically:
    // 1. Use BigQuery tools to query data
    // 2. Process the results
    // 3. Use BigQuery tools to write back
    
    return result;
  }
}
```

### 3. **Scheduled Job Runner**
```javascript
// src/index.js
import cron from 'node-cron';
import { FinancialProcessor } from './processors/financialProcessor.js';
import { logger } from './utils/logger.js';

const processor = new FinancialProcessor();

// Schedule daily at 2 AM
cron.schedule('0 2 * * *', async () => {
  logger.info('Starting financial data processing');
  
  try {
    const result = await processor.processFinancialData();
    logger.info('Processing completed:', result);
  } catch (error) {
    logger.error('Processing failed:', error);
    // Send alerts
  }
});

// For testing
if (process.argv.includes('--run-now')) {
  processor.processFinancialData()
    .then(() => process.exit(0))
    .catch(err => {
      console.error(err);
      process.exit(1);
    });
}
```

### 4. **Advanced: Custom Tool Orchestration**
If you need more control over the BigQuery operations:

```javascript
// src/processors/advancedProcessor.js
import { generateText } from '@vercel/ai';
import { openai } from '@vercel/ai/openai';
import { getBigQueryTools } from '../services/mcpClient.js';

export class AdvancedProcessor {
  async processWithCustomLogic() {
    const { client, tools } = await getBigQueryTools();
    
    // Step 1: Query data manually using MCP tool
    const queryTool = tools.find(t => t.name === 'query');
    const queryResult = await client.callTool({
      name: 'query',
      arguments: {
        query: `
          SELECT * FROM transactions 
          WHERE processed = FALSE 
          AND DATE(timestamp) = CURRENT_DATE() - 1
        `
      }
    });

    // Step 2: Process each batch with AI
    const transactions = JSON.parse(queryResult.content);
    const categorized = [];
    
    for (const batch of chunks(transactions, 100)) {
      const result = await generateText({
        model: openai('gpt-4-turbo'),
        messages: [
          {
            role: 'system',
            content: 'Categorize these financial transactions...'
          },
          {
            role: 'user',
            content: JSON.stringify(batch)
          }
        ],
        // No tools needed here - just AI processing
      });
      
      categorized.push(...JSON.parse(result.text));
    }

    // Step 3: Write back using MCP tool
    await client.callTool({
      name: 'insert',
      arguments: {
        table: 'processed_transactions',
        rows: categorized
      }
    });
  }
}
```

## Project Structure
```
financial-processor/
├── src/
│   ├── index.js              # Entry point with scheduler
│   ├── services/
│   │   └── mcpClient.js      # MCP connection setup
│   ├── processors/
│   │   ├── financialProcessor.js    # Main AI processor
│   │   └── advancedProcessor.js     # Custom orchestration
│   └── utils/
│       ├── logger.js         # Simple logging
│       └── chunks.js         # Batch processing helper
├── .env
├── package.json
└── README.md
```

## Package.json
```json
{
  "name": "bigquery-ai-processor",
  "type": "module",
  "scripts": {
    "start": "node src/index.js",
    "run-now": "node src/index.js --run-now",
    "dev": "node --watch src/index.js"
  },
  "dependencies": {
    "ai": "^4.2.0",
    "@ai-sdk/openai": "latest",
    "node-cron": "^3.0.0",
    "dotenv": "^16.0.0",
    "@ergut/mcp-bigquery-server": "latest"
  }
}
```

## Environment Variables
```bash
# .env
GCP_PROJECT_ID=your-project-id
GCP_LOCATION=us-central1
GCP_KEY_FILE_PATH=/path/to/service-account-key.json
OPENAI_API_KEY=your-openai-key
```

## Key Advantages

1. **No Custom BigQuery Code**: The MCP server handles all BigQuery operations
2. **AI-Driven Orchestration**: The AI decides when and how to use BigQuery tools
3. **Flexible Architecture**: Can run fully autonomous or with custom control
4. **Minimal Dependencies**: Just the scheduler, AI SDK, and MCP server

## Alternative MCP Connection Methods

### Remote MCP Server (if running separately):
```javascript
const client = await createMCPClient({
  transport: {
    type: 'sse',  // Server-Sent Events for remote
    url: 'http://localhost:8080/mcp',
    headers: {
      'Authorization': 'Bearer ' + process.env.MCP_TOKEN
    }
  }
});
```

### Using Different BigQuery MCP Implementations:
```javascript
// For @LucasHild/mcp-server-bigquery
const client = await createMCPClient({
  transport: {
    type: 'stdio',
    command: 'uvx',
    args: [
      'mcp-server-bigquery',
      '--project', process.env.GCP_PROJECT_ID,
      '--location', process.env.GCP_LOCATION
    ]
  }
});
```