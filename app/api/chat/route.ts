import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, UIMessage, stepCountIs } from 'ai';
import { getBigQueryTools } from '@/lib/mcp-client';

export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const { messages }: { messages: UIMessage[] } = await request.json();
    
    // Get BigQuery MCP client and tools
    console.log('Getting BigQuery MCP client...');
    const { client: mcpClient } = await getBigQueryTools();
    console.log('MCP client obtained:', !!mcpClient);
    
    // Get tools directly from MCP client
    const tools = await mcpClient.tools();
    console.log('Available MCP tools:', Object.keys(tools));

    const result = streamText({
      model: openai('gpt-4-turbo'),
      system: `You are a financial expert and help the user with BigQuery data when asked. 
      
      IMPORTANT: Before querying any table, ALWAYS first check its schema to understand what columns are available:
      - To see columns in a table: SELECT column_name, data_type FROM \`project_id.dataset_name.INFORMATION_SCHEMA.COLUMNS\` WHERE table_name = 'table_name'
      
      When users ask for data from a specific table:
      1. First run a schema query to see what columns exist
      2. Then query the actual data using only the columns that exist
      3. Use LIMIT 10 to get a reasonable number of records
      
      For discovery queries:
      - To list all datasets: SELECT schema_name FROM INFORMATION_SCHEMA.SCHEMATA
      - To list tables in a dataset: SELECT table_name FROM \`dataset_name.INFORMATION_SCHEMA.TABLES\`
      
      When presenting query results:
      - ALWAYS format data as markdown tables when showing tabular data
      - Use proper markdown table syntax with headers and alignment
      - For financial amounts, include currency symbols
      - Keep explanatory text concise and place tables prominently
      - Example markdown table format:
        | Column 1 | Column 2 | Column 3 |
        |----------|----------|----------|
        | Data 1   | Data 2   | Data 3   |
      
      When you receive query results from tools, provide a brief introduction followed by the data in a well-formatted markdown table.`,
      messages: convertToModelMessages(messages),
      stopWhen: stepCountIs(5), // Use stopWhen for multi-step processing
      tools: tools, // Use MCP tools directly
      onFinish: async () => {
        // Close the MCP connection when done
        // Note: In production, you might want to keep connections pooled
        // await mcpClient.close();
      },
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        console.error('Stream error:', error);
        return error instanceof Error ? error.message : String(error);
      },
    });
  } catch (error) {
    console.error('Chat API error:', error);
    return new Response(
      JSON.stringify({ error: 'Failed to process chat request' }), 
      { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      }
    );
  }
}