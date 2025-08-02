import { experimental_createMCPClient as createMCPClient } from 'ai';
import { config } from 'dotenv';
import { logger } from '../utils/logger.js';

config();

let mcpClientInstance = null;
let mcpToolsCache = null;

export async function getBigQueryTools() {
  if (mcpClientInstance && mcpToolsCache) {
    logger.debug('Returning cached MCP client and tools');
    return { client: mcpClientInstance, tools: mcpToolsCache };
  }

  try {
    logger.info('Connecting to BigQuery MCP server...');
    
    const client = await createMCPClient({
      transport: {
        type: 'stdio',
        command: 'npx',
        args: [
          '-y',
          '@ergut/mcp-bigquery-server',
          '--project-id', process.env.GCP_PROJECT_ID,
          '--location', process.env.GCP_LOCATION || 'us-central1',
          '--key-file', process.env.GCP_KEY_FILE_PATH
        ]
      }
    });

    const tools = await client.tools();
    
    mcpClientInstance = client;
    mcpToolsCache = tools;
    
    logger.info(`Successfully connected to BigQuery MCP. Available tools: ${tools.map(t => t.name).join(', ')}`);
    
    return { client, tools };
  } catch (error) {
    logger.error('Failed to connect to BigQuery MCP server:', error);
    throw new Error(`MCP Connection Failed: ${error.message}`);
  }
}

export async function getRemoteBigQueryTools() {
  if (!process.env.MCP_SERVER_URL) {
    throw new Error('MCP_SERVER_URL environment variable is not set');
  }

  try {
    logger.info('Connecting to remote BigQuery MCP server...');
    
    const client = await createMCPClient({
      transport: {
        type: 'sse',
        url: process.env.MCP_SERVER_URL,
        headers: {
          'Authorization': `Bearer ${process.env.MCP_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    });

    const tools = await client.tools();
    
    logger.info(`Connected to remote MCP. Available tools: ${tools.map(t => t.name).join(', ')}`);
    
    return { client, tools };
  } catch (error) {
    logger.error('Failed to connect to remote BigQuery MCP server:', error);
    throw error;
  }
}

export async function closeMCPConnection() {
  if (mcpClientInstance) {
    try {
      await mcpClientInstance.close();
      mcpClientInstance = null;
      mcpToolsCache = null;
      logger.info('MCP connection closed successfully');
    } catch (error) {
      logger.error('Error closing MCP connection:', error);
    }
  }
}

export function findToolByName(tools, name) {
  return tools.find(tool => tool.name === name);
}

export async function executeQuery(client, query) {
  try {
    logger.debug(`Executing BigQuery query: ${query.substring(0, 100)}...`);
    
    const result = await client.callTool({
      name: 'query',
      arguments: { query }
    });
    
    return JSON.parse(result.content);
  } catch (error) {
    logger.error('BigQuery query execution failed:', error);
    throw error;
  }
}

export async function insertRows(client, table, rows) {
  try {
    logger.debug(`Inserting ${rows.length} rows into ${table}`);
    
    const result = await client.callTool({
      name: 'insert',
      arguments: { table, rows }
    });
    
    return result;
  } catch (error) {
    logger.error(`Failed to insert rows into ${table}:`, error);
    throw error;
  }
}