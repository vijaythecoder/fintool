import { streamText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getBigQueryTools } from './src/services/mcpClient.js';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function saveResultsToCSV(results, customFilename = null) {
  try {
    // Create results directory if it doesn't exist
    const resultsDir = path.join(__dirname, 'results');
    await fs.mkdir(resultsDir, { recursive: true });
    
    // Use custom filename or generate with timestamp
    let filename;
    if (customFilename) {
      filename = customFilename.endsWith('.csv') ? customFilename : `${customFilename}.csv`;
    } else {
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, -5);
      filename = `pattern_matches_${timestamp}.csv`;
    }
    const filepath = path.join(resultsDir, filename);
    
    // CSV headers - including transaction details
    const headers = ['bt_id', 'text', 'amount', 'currency', 'AI_SUGGEST_TEXT', 'AI_CONFIDENCE_SCORE', 'AI_REASON', 'AI_GL_ACCOUNT', 'AI_PRCSSR_PTRN_FT', 'UPDATED_AT'];
    
    // Create CSV content
    let csvContent = headers.join(',') + '\n';
    
    for (const row of results) {
      const values = headers.map(header => {
        const value = row[header] || '';
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
    console.log(`\n💾 Results saved to: ${filepath}`);
    console.log(`   Total records: ${results.length}`);
    
    return filepath;
  } catch (error) {
    console.error('\n❌ Error saving CSV:', error.message);
    throw error;
  }
}

async function processPatternMatching(customFilename = null) {
  console.log('🔍 Cash Transaction Pattern Matching Processor\n');
  
  try {
    // Get BigQuery MCP client and tools
    console.log('📊 Connecting to BigQuery...');
    const { client: mcpClient } = await getBigQueryTools();
    const tools = await mcpClient.tools();
    console.log('✅ Connected to BigQuery\n');

    // Get dataset from environment
    const dataset = process.env.CASH_CLEARING_DATASET || 'ksingamsetty-test.AI_POC';
    console.log(`📋 Dataset: ${dataset}\n`);

    // System prompt for 4-step pattern matching process
    const systemPrompt = `You are an expert at analyzing cash transactions and identifying patterns using a 4-step process.

CRITICAL INSTRUCTION: You MUST complete ALL 4 steps and provide a final results table. Do not stop after executing queries - you must analyze the data and provide pattern matching results.

Your task follows this exact workflow:

Step 1: Query unmatched transactions
- Get transactions from cash_transactions table where pattern='T_NOTFOUND'
- Select: bt_id, customer_account_number, type_code, text, amount, currency
- bt_id is the primary key and must be carried through all steps
- amount and currency must be included in final results

Step 2: Pattern matching
- Query cash_processor_patterns table
- Match transaction text against pattern_search column
- Determine the pattern_op for each transaction

Step 3: GL Account determination
- For each identified pattern_op from Step 2
- Query cash_gl_patterns table where pattern = pattern_op
- Get GL_ACCOUNT and FT_ID values

Step 4: MANDATORY - Create final results table AND JSON output
- Analyze each transaction and match patterns
- Create a complete table with ALL 10 transactions
- Include: bt_id, text, amount, currency, AI_SUGGEST_TEXT, AI_CONFIDENCE_SCORE, AI_REASON, AI_GL_ACCOUNT, AI_PRCSSR_PTRN_FT, UPDATED_AT
- ALSO provide the results as JSON after the table in this exact format:
\`\`\`json
{
  "results": [
    {
      "bt_id": "value",
      "text": "transaction text",
      "amount": "numeric value",
      "currency": "currency code",
      "AI_SUGGEST_TEXT": "value",
      "AI_CONFIDENCE_SCORE": "value",
      "AI_REASON": "value",
      "AI_GL_ACCOUNT": "value",
      "AI_PRCSSR_PTRN_FT": "value",
      "UPDATED_AT": "CURRENT_TIMESTAMP"
    }
  ]
}
\`\`\`

Pattern matching rules:
- "INTEREST" or "INT" in text → INCOME pattern
- "MASTERCARD", "VISA" in text → SETTLEMENT pattern  
- "PAYPAL" in text → SETTLEMENT pattern
- "MISCELLANEOUS" in text → SETTLEMENT pattern

DO NOT end without showing BOTH the complete final results table AND the JSON output.`;

    const userPrompt = `Execute the 4-step cash transaction pattern matching process:

Step 1: Get 10 transactions
SELECT bt_id, customer_account_number, type_code, text, amount, currency 
FROM ${dataset}.cash_transactions 
WHERE pattern = 'T_NOTFOUND' 
LIMIT 10

Step 2: Get common patterns for matching
SELECT DISTINCT pattern_op, pattern_search
FROM ${dataset}.cash_processor_patterns
WHERE pattern_search IS NOT NULL
LIMIT 50

Step 3: Match patterns and get GL accounts
For each transaction from Step 1:
- Search for pattern_search keywords in the transaction text
- When a match is found, use that pattern_op
- Then query GL_ACCOUNT and FT_ID from cash_gl_patterns for that pattern_op

Step 4: FINAL RESULTS TABLE (YOU MUST COMPLETE THIS STEP)
After analyzing all transactions, create and display a complete results table with these columns:

| bt_id | text | amount | currency | AI_SUGGEST_TEXT | AI_CONFIDENCE_SCORE | AI_REASON | AI_GL_ACCOUNT | AI_PRCSSR_PTRN_FT | UPDATED_AT |

For EACH of the 10 transactions:
1. Match the transaction text against pattern_search values
2. If "INTEREST" or "INT" found → pattern_op = "INCOME"
3. If "MASTERCARD" or "VISA" found → pattern_op = "SETTLEMENT"
4. If "PAYPAL" found → pattern_op = "SETTLEMENT"
5. If "MISCELLANEOUS" found → pattern_op = "SETTLEMENT"
6. Assign confidence score based on match quality
7. Get GL_ACCOUNT and FT_ID for that pattern_op from GL patterns

YOU MUST show the complete final table with all 10 rows filled in AND provide the JSON output as specified above. Do not stop without showing BOTH the table and JSON.`;

    // Create the stream
    const result = streamText({
      model: openai('gpt-4o-mini'),
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt }
      ],
      stopWhen: stepCountIs(15), // Allow more steps for the 4-step process
      tools: tools,
      temperature: 0.1,
    });

    // Process the stream
    console.log('🔄 Processing transactions...\n');
    let fullText = '';
    
    for await (const delta of result.textStream) {
      fullText += delta;
      process.stdout.write(delta);
    }

    // Get the final result
    const finalResult = await result;
    
    // Try to extract JSON from the response
    let jsonData = null;
    const jsonMatch = fullText.match(/```json\s*([\s\S]*?)\s*```/);
    if (jsonMatch) {
      try {
        jsonData = JSON.parse(jsonMatch[1]);
        console.log('\n\n✅ Successfully extracted results data');
        
        // Save to CSV
        await saveResultsToCSV(jsonData.results, customFilename);
      } catch (parseError) {
        console.error('\n⚠️  Warning: Could not parse JSON results:', parseError.message);
        console.log('Results were displayed but not saved to CSV.');
      }
    } else {
      console.log('\n⚠️  Warning: No JSON results found in AI response.');
      console.log('Results were displayed but not saved to CSV.');
    }
    
    // Summary
    console.log('\n📈 Processing Summary:');
    console.log(`- Dataset: ${dataset}`);
    console.log(`- Total steps: ${finalResult.steps?.length || 0}`);
    
    let toolCallCount = 0;
    if (finalResult.steps && Array.isArray(finalResult.steps)) {
      finalResult.steps.forEach((step) => {
        toolCallCount += step.toolCalls?.length || 0;
      });
    }
    
    console.log(`- Total tool calls: ${toolCallCount}`);
    console.log(`- Model: gpt-4o-mini`);
    console.log('\n✨ Pattern matching completed!');
    
    // Gracefully close the MCP connection
    await mcpClient.close();
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (error.type === 'context_length_exceeded') {
      console.error('   Try reducing the number of patterns queried.');
    }
    process.exit(1);
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
let outputFilename = null;

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--output' || args[i] === '-o') {
    outputFilename = args[i + 1];
    i++; // Skip the next argument since we consumed it
  } else if (args[i] === '--help' || args[i] === '-h') {
    console.log('Usage: node pattern-matcher-cli.js [options]');
    console.log('\nOptions:');
    console.log('  -o, --output <filename>  Custom output filename (saved in results/ directory)');
    console.log('  -h, --help              Show this help message');
    console.log('\nExample:');
    console.log('  node pattern-matcher-cli.js --output my-results');
    process.exit(0);
  }
}

console.log('🚀 Cash Transaction Pattern Matcher');
console.log('─'.repeat(50) + '\n');

// Run the pattern matching
processPatternMatching(outputFilename).then(() => {
  // Exit after a short delay to ensure all output is flushed
  setTimeout(() => process.exit(0), 100);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});