import { openai } from '@ai-sdk/openai';
import { streamText, convertToModelMessages, UIMessage } from 'ai';
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
      toolCallStreaming: true,
      system: `You are a financial expert and help the user with the BigQuery data when asked.`,
      messages: convertToModelMessages(messages),
      maxSteps: 5,
      tools: tools, // Use MCP tools directly
      onFinish: async () => {
        // Close the MCP connection when done
        // Note: In production, you might want to keep connections pooled
        // await mcpClient.close();
      },
    });

    return result.toUIMessageStreamResponse();
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