import { streamText, stepCountIs } from 'ai';
import { openai } from '@ai-sdk/openai';
import { getBigQueryTools } from './src/services/mcpClient.js';
import dotenv from 'dotenv';

dotenv.config();

async function processPatternMatching() {
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
- Select: bt_id, customer_account_number, type_code, text
- bt_id is the primary key and must be carried through all steps

Step 2: Pattern matching
- Query cash_processor_patterns table
- Match transaction text against pattern_search column
- Determine the pattern_op for each transaction

Step 3: GL Account determination
- For each identified pattern_op from Step 2
- Query cash_gl_patterns table where pattern = pattern_op
- Get GL_ACCOUNT and FT_ID values

Step 4: MANDATORY - Create final results table
- Analyze each transaction and match patterns
- Create a complete table with ALL 10 transactions
- Include: bt_id, AI_SUGGEST_TEXT, AI_CONFIDENCE_SCORE, AI_REASON, AI_GL_ACCOUNT, AI_PRCSSR_PTRN_FT, UPDATED_AT
- This is the most important step - you MUST show the final analyzed results

Pattern matching rules:
- "INTEREST" or "INT" in text → INCOME pattern
- "MASTERCARD", "VISA" in text → SETTLEMENT pattern  
- "PAYPAL" in text → SETTLEMENT pattern
- "MISCELLANEOUS" in text → SETTLEMENT pattern

DO NOT end without showing the complete final results table with pattern suggestions.`;

    const userPrompt = `Execute the 4-step cash transaction pattern matching process:

Step 1: Get 10 transactions
SELECT bt_id, customer_account_number, type_code, text 
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

| bt_id | AI_SUGGEST_TEXT | AI_CONFIDENCE_SCORE | AI_REASON | AI_GL_ACCOUNT | AI_PRCSSR_PTRN_FT | UPDATED_AT |

For EACH of the 10 transactions:
1. Match the transaction text against pattern_search values
2. If "INTEREST" or "INT" found → pattern_op = "INCOME"
3. If "MASTERCARD" or "VISA" found → pattern_op = "SETTLEMENT"
4. If "PAYPAL" found → pattern_op = "SETTLEMENT"
5. If "MISCELLANEOUS" found → pattern_op = "SETTLEMENT"
6. Assign confidence score based on match quality
7. Get GL_ACCOUNT and FT_ID for that pattern_op from GL patterns

YOU MUST show the complete final table with all 10 rows filled in. Do not stop without showing this table.`;

    // Create the stream
    const result = streamText({
      model: openai('gpt-4.1'),
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
    
    // Summary
    console.log('\n\n📈 Processing Summary:');
    console.log(`- Dataset: ${dataset}`);
    console.log(`- Total steps: ${finalResult.steps?.length || 0}`);
    
    let toolCallCount = 0;
    if (finalResult.steps && Array.isArray(finalResult.steps)) {
      finalResult.steps.forEach((step) => {
        toolCallCount += step.toolCalls?.length || 0;
      });
    }
    
    console.log(`- Total tool calls: ${toolCallCount}`);
    console.log(`- Model: ${openai.name || 'gpt-4-turbo'}`);
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

console.log('🚀 Cash Transaction Pattern Matcher');
console.log('─'.repeat(50) + '\n');

// Run the pattern matching
processPatternMatching().then(() => {
  // Exit after a short delay to ensure all output is flushed
  setTimeout(() => process.exit(0), 100);
}).catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});