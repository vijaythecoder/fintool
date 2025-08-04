#!/usr/bin/env node

import { BatchPatternProcessorV7 } from './src/processors/batchPatternProcessorV7.js';
import { logger } from './src/utils/logger.js';
import dotenv from 'dotenv';
import { program } from 'commander';

// Load environment variables
dotenv.config();

// Parse command line arguments
program
  .name('pattern-matcher-batch')
  .description('Batch process pattern matching for cash transactions')
  .version('1.0.0')
  .option('-b, --batch-size <number>', 'Number of transactions per batch', parseInt)
  .option('-c, --concurrency <number>', 'Number of concurrent batches', parseInt)
  .option('-l, --limit <number>', 'Maximum transactions to process', parseInt)
  .option('-o, --output <directory>', 'Output directory for CSV files')
  .option('--use-ai', 'Use AI for pattern matching instead of local rules')
  .option('--dry-run', 'Show what would be processed without making changes')
  .option('--resume <batchId>', 'Resume from a previous batch')
  .parse();

const options = program.opts();

// Main execution
async function main() {
  console.log('🚀 Cash Transaction Pattern Matcher - Batch Mode');
  console.log('─'.repeat(50) + '\n');
  
  try {
    // Configure processor
    const processorConfig = {
      batchSize: options.batchSize || parseInt(process.env.PATTERN_BATCH_SIZE || '100'),
      concurrency: options.concurrency || parseInt(process.env.PATTERN_CONCURRENCY || '3'),
      maxDailyLimit: options.limit || parseInt(process.env.PATTERN_MAX_DAILY_LIMIT || '50000'),
      outputDir: options.output || process.env.PATTERN_OUTPUT_DIR || './results'
    };
    
    // Override local pattern matching if --use-ai flag is set
    if (options.useAi) {
      process.env.USE_LOCAL_PATTERN_MATCHING = 'false';
    }
    
    // Log configuration
    logger.info('Configuration:', {
      dataset: process.env.CASH_CLEARING_DATASET,
      model: process.env.OPENAI_MODEL,
      batchSize: processorConfig.batchSize,
      concurrency: processorConfig.concurrency,
      maxDailyLimit: processorConfig.maxDailyLimit,
      outputDir: processorConfig.outputDir,
      useAI: process.env.USE_LOCAL_PATTERN_MATCHING !== 'true',
      dryRun: options.dryRun || false
    });
    
    if (options.dryRun) {
      console.log('\n⚠️  DRY RUN MODE - No changes will be made\n');
      
      // Just show what would be processed
      const processor = new BatchPatternProcessorV7(processorConfig);
      await processor.initialize();
      const count = await processor.getUnprocessedCount();
      await processor.cleanup();
      
      console.log(`Would process ${Math.min(count, processorConfig.maxDailyLimit)} of ${count} unprocessed transactions`);
      console.log(`Estimated time: ${Math.ceil(count / 1000)} minutes`);
      
      process.exit(0);
    }
    
    // Create and run processor
    const processor = new BatchPatternProcessorV7(processorConfig);
    
    console.log('📊 Starting batch processing...\n');
    const startTime = Date.now();
    
    const summary = await processor.process({
      resumeBatchId: options.resume
    });
    
    // Display summary
    console.log('\n' + '─'.repeat(50));
    console.log('✅ Batch Processing Complete!\n');
    console.log('📈 Summary:');
    console.log(`- Batch ID: ${summary.batchId}`);
    console.log(`- Total Processed: ${summary.processed}`);
    console.log(`- Successful: ${summary.succeeded} (${summary.successRate.toFixed(1)}%)`);
    console.log(`- Failed: ${summary.failed}`);
    console.log(`- Duration: ${summary.durationFormatted}`);
    console.log(`- Average Speed: ${summary.averageSpeed.toFixed(1)} transactions/sec`);
    console.log(`- CSV Output: ${summary.csvFile}`);
    
    if (summary.errors && summary.errors.length > 0) {
      console.log(`\n⚠️  Errors encountered: ${summary.errors.length}`);
      summary.errors.forEach(error => {
        console.log(`  - Batch ${error.batchIndex}: ${error.error}`);
      });
    }
    
    // Exit successfully
    process.exit(0);
    
  } catch (error) {
    console.error('\n❌ Batch processing failed:', error.message);
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

// Handle process termination
process.on('SIGINT', async () => {
  console.log('\n\n⚠️  Process interrupted. Saving progress...');
  // The progress tracker will automatically save on next update
  setTimeout(() => process.exit(1), 3000);
});

// Run main function
main().catch(error => {
  console.error('Unhandled error:', error);
  process.exit(1);
});

// Export for testing
export { main };