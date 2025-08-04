import { getBigQueryTools } from './src/services/mcpClient.js';
import { logger } from './src/utils/logger.js';

async function checkTransactions() {
  try {
    console.log('🔍 Checking transaction patterns in database...\n');
    
    // Connect to BigQuery
    const { client, tools } = await getBigQueryTools();
    console.log('✅ Connected to BigQuery\n');
    
    // Query 1: Check distinct pattern values
    console.log('📊 Checking distinct PATTERN values:');
    const patternQuery = `
      SELECT PATTERN, COUNT(*) as count
      FROM ksingamsetty-test.AI_POC.cash_transactions
      GROUP BY PATTERN
      ORDER BY count DESC
      LIMIT 10
    `;
    
    const patternResult = await client.callTool('bigquery', 'query', { sql: patternQuery });
    if (patternResult && patternResult.rows) {
      console.table(patternResult.rows);
    }
    
    // Query 2: Check for T_NOTFOUND pattern
    console.log('\n📊 Checking for T_NOTFOUND pattern:');
    const notFoundQuery = `
      SELECT COUNT(*) as total_t_notfound
      FROM ksingamsetty-test.AI_POC.cash_transactions
      WHERE PATTERN = 'T_NOTFOUND'
    `;
    
    const notFoundResult = await client.callTool('query', { sql: notFoundQuery });
    if (notFoundResult && notFoundResult.rows) {
      console.log(`Total T_NOTFOUND transactions: ${notFoundResult.rows[0]?.total_t_notfound || 0}`);
    }
    
    // Query 3: Check sample of all transactions
    console.log('\n📊 Sample transactions:');
    const sampleQuery = `
      SELECT BT_ID, TEXT, PATTERN, PATTERN_PROCESSED_AT
      FROM ksingamsetty-test.AI_POC.cash_transactions
      LIMIT 5
    `;
    
    const sampleResult = await client.callTool('query', { sql: sampleQuery });
    if (sampleResult && sampleResult.rows) {
      console.table(sampleResult.rows);
    }
    
    // Query 4: Check for NULL pattern
    console.log('\n📊 Checking for NULL patterns:');
    const nullQuery = `
      SELECT COUNT(*) as null_patterns
      FROM ksingamsetty-test.AI_POC.cash_transactions
      WHERE PATTERN IS NULL
    `;
    
    const nullResult = await client.callTool('query', { sql: nullQuery });
    if (nullResult && nullResult.rows) {
      console.log(`Total NULL patterns: ${nullResult.rows[0]?.null_patterns || 0}`);
    }
    
    await client.close();
    console.log('\n✅ Check complete!');
    
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkTransactions();