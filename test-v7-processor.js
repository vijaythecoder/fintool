import { BatchPatternProcessorV7 } from './src/processors/batchPatternProcessorV7.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function testV7Processor() {
  console.log('🧪 Testing BatchPatternProcessorV7 with AI-driven MCP approach\n');
  
  try {
    // Configure processor for small test
    const processorConfig = {
      batchSize: 5,  // Small batch for testing
      maxDailyLimit: 10,  // Limit to 10 transactions for testing
      outputDir: './results/test-v7'
    };
    
    console.log('📋 Test Configuration:');
    console.log(`- Batch Size: ${processorConfig.batchSize}`);
    console.log(`- Max Limit: ${processorConfig.maxDailyLimit}`);
    console.log(`- Model: ${process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet'}`);
    console.log(`- Dataset: ${process.env.CASH_CLEARING_DATASET}`);
    console.log(`- Provider: OpenRouter`);
    console.log(`- Approach: AI-driven with BigQuery MCP tools\n`);
    
    // Create processor
    const processor = new BatchPatternProcessorV7(processorConfig);
    
    console.log('🔄 Starting test processing...');
    console.log('🤖 AI will autonomously query patterns using BigQuery MCP\n');
    const startTime = Date.now();
    
    // Process
    const summary = await processor.process();
    
    // Display results
    console.log('\n' + '─'.repeat(50));
    console.log('✅ Test Complete!\n');
    console.log('📈 Results:');
    console.log(`- Batch ID: ${summary.batchId}`);
    console.log(`- Total Processed: ${summary.processed}`);
    console.log(`- Successful: ${summary.succeeded} (${summary.successRate.toFixed(1)}%)`);
    console.log(`- Failed: ${summary.failed}`);
    console.log(`- Duration: ${summary.durationFormatted}`);
    console.log(`- Average Speed: ${summary.averageSpeed.toFixed(2)} transactions/sec`);
    console.log(`- CSV Output: ${summary.csvFile}`);
    
    if (summary.errors && summary.errors.length > 0) {
      console.log(`\n⚠️  Errors: ${summary.errors.length}`);
      summary.errors.forEach(error => {
        console.log(`  - ${error.error}`);
      });
    }
    
    // Performance analysis
    const totalSeconds = (Date.now() - startTime) / 1000;
    console.log(`\n⏱️  Performance Analysis:`);
    console.log(`- Total time: ${totalSeconds.toFixed(1)} seconds`);
    console.log(`- Time per transaction: ${(totalSeconds / summary.processed).toFixed(1)} seconds`);
    
    console.log('\n✨ V7 processor test completed successfully!');
    console.log('🎯 AI autonomously handled pattern fetching and matching');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run test
testV7Processor().then(() => {
  console.log('\n👍 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});