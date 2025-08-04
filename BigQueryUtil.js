import { streamText } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getBigQueryTools } from './src/services/mcpClient.js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function saveQueryResultsToCSV(results, query) {
  try {
    // Create results directory if it doesn't exist
    const resultsDir = path.join(__dirname, 'results', 'queries');
    await fs.mkdir(resultsDir, { recursive: true });
    
    // Generate filename with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
    const filename = `query_results_${timestamp}.csv`;
    const filepath = path.join(resultsDir, filename);
    
    // Get headers from first row
    if (!results || results.length === 0) {
      console.log('No results to save');
      return null;
    }
    
    const headers = Object.keys(results[0]);
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    for (const row of results) {
      const values = headers.map(header => {
        const value = row[header] !== null && row[header] !== undefined ? row[header] : '';
        // Escape quotes and wrap in quotes if contains comma or quotes
        const escaped = String(value).replace(/"/g, '""');
        return escaped.includes(',') || escaped.includes('"') || escaped.includes('\n') 
          ? `"${escaped}"` 
          : escaped;
      });
      csvContent += values.join(',') + '\n';
    }
    
    // Write to file
    await fs.writeFile(filepath, csvContent, 'utf8');
    
    // Also save query for reference
    const queryFile = filepath.replace('.csv', '_query.txt');
    await fs.writeFile(queryFile, query, 'utf8');
    
    return { filepath, queryFile };
  } catch (error) {
    console.error('Error saving CSV:', error.message);
    return null;
  }
}

async function executeBigQuery(query, options = {}) {
  console.log('🔍 BigQuery Utility Tool\n');
  console.log('📝 Query:', query);
  console.log('─'.repeat(50) + '\n');
  
  try {
    // Get BigQuery MCP client and tools
    console.log('📊 Connecting to BigQuery...');
    const { client: mcpClient } = await getBigQueryTools();
    const tools = await mcpClient.tools();
    console.log('✅ Connected to BigQuery\n');

    // System prompt for query execution
    const systemPrompt = `You are a BigQuery assistant. Execute the provided SQL query and return results.
    
IMPORTANT: 
- Execute the exact query provided by the user
- Display results in a clear table format
- If asked to save to CSV, also provide results as JSON in this format:
\`\`\`json
{
  "results": [array of row objects],
  "rowCount": number,
  "query": "the executed query"
}
\`\`\``;

    const userPrompt = `Execute this BigQuery query: ${query}
    
${options.csv ? 'Also provide the results as JSON for CSV export.' : ''}`;

    // Create the stream
    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      tools: tools,
      temperature: 0.1,
      maxSteps: 5
    });

    // Process the stream
    console.log('🔄 Executing query...\n');
    let fullText = '';
    
    for await (const delta of result.textStream) {
      fullText += delta;
      process.stdout.write(delta);
    }

    // Get the final result
    const finalResult = await result;
    
    // Try to extract JSON if CSV option is enabled
    if (options.csv) {
      const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
      if (jsonMatch) {
        try {
          const jsonData = JSON.parse(jsonMatch[1]);
          const savedFiles = await saveQueryResultsToCSV(jsonData.results, query);
          
          if (savedFiles) {
            console.log(`\n\n💾 Results saved to: ${savedFiles.filepath}`);
            console.log(`📄 Query saved to: ${savedFiles.queryFile}`);
            console.log(`📊 Total rows: ${jsonData.rowCount || jsonData.results.length}`);
          }
        } catch (parseError) {
          console.error('\n⚠️  Warning: Could not parse JSON results for CSV export');
        }
      }
    }
    
    // Summary
    console.log('\n\n📈 Query Summary:');
    console.log(`- Total steps: ${finalResult.steps?.length || 0}`);
    console.log(`- Model: gpt-4o-mini`);
    console.log('\n✨ Query completed!');
    
    // Gracefully close the MCP connection
    await mcpClient.close();
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
  console.log('Usage: node BigQueryUtil.js "<SQL query>" [options]');
  console.log('\nOptions:');
  console.log('  --csv           Save results to CSV file');
  console.log('  -h, --help      Show this help message');
  console.log('\nExamples:');
  console.log('  node BigQueryUtil.js "SELECT * FROM dataset.table LIMIT 10"');
  console.log('  node BigQueryUtil.js "SELECT COUNT(*) FROM dataset.table" --csv');
  console.log('\nNote: Wrap your SQL query in quotes to ensure it\'s treated as a single argument.');
  process.exit(0);
}

// Get query and options
const query = args[0];
const options = {
  csv: args.includes('--csv')
};

// Validate query
if (!query || query.trim().length === 0) {
  console.error('❌ Error: Query cannot be empty');
  process.exit(1);
}

// Execute the query
executeBigQuery(query, options).then(() => {
  setTimeout(() => process.exit(0), 100);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});