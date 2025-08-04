import { BatchPatternProcessorV7 } from './src/processors/batchPatternProcessorV7.js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

// Check for OpenRouter API key
if (!process.env.OPENROUTER_API_KEY) {
  console.error('❌ OPENROUTER_API_KEY is not set in your .env file');
  console.log('\nTo get started with OpenRouter:');
  console.log('1. Sign up at https://openrouter.ai/');
  console.log('2. Get your API key from https://openrouter.ai/keys');
  console.log('3. Add it to your .env file:');
  console.log('   OPENROUTER_API_KEY=your-key-here');
  console.log('4. Optionally set a model (default: anthropic/claude-3.5-sonnet):');
  console.log('   OPENROUTER_MODEL=anthropic/claude-3.5-sonnet');
  process.exit(1);
}

async function testOpenRouterV7() {
  console.log('🧪 Testing BatchPatternProcessorV7 with OpenRouter\n');
  
  try {
    // Configure processor for small test
    const processorConfig = {
      batchSize: 3,  // Very small batch for testing
      maxDailyLimit: 3,  // Only 3 transactions
      outputDir: './results/test-openrouter-v7'
    };
    
    console.log('📋 Test Configuration:');
    console.log(`- Provider: OpenRouter`);
    console.log(`- API Key: ${process.env.OPENROUTER_API_KEY.substring(0, 10)}...`);
    console.log(`- Model: ${process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-sonnet'}`);
    console.log(`- Batch Size: ${processorConfig.batchSize}`);
    console.log(`- Max Limit: ${processorConfig.maxDailyLimit}`);
    console.log(`- Dataset: ${process.env.CASH_CLEARING_DATASET}\n`);
    
    // Create processor
    const processor = new BatchPatternProcessorV7(processorConfig);
    
    console.log('🔄 Starting test processing...');
    console.log('🤖 AI will use OpenRouter to access various models\n');
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
    
    console.log('\n✨ OpenRouter integration test completed!');
    console.log('🎯 You can now use any model available on OpenRouter');
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    
    if (error.message.includes('401') || error.message.includes('Unauthorized')) {
      console.error('\n⚠️  API Key issue detected');
      console.error('Please check that your OPENROUTER_API_KEY is valid');
    }
    
    console.error('\nFull error:', error.stack);
    process.exit(1);
  }
}

// Run test
testOpenRouterV7().then(() => {
  console.log('\n👍 Test completed');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});