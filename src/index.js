import cron from 'node-cron';
import { config } from 'dotenv';
import { AdvancedProcessor } from './processors/advancedProcessor.js';
import { patternMatchingJob } from './jobs/patternMatchingJob.js';
import { logger } from './utils/logger.js';
import { closeMCPConnection } from './services/mcpClient.js';
import { format } from 'date-fns';

config();

const processorType = process.env.PROCESSOR_TYPE || 'standard';
const cronSchedule = process.env.CRON_SCHEDULE || '0 2 * * *';
const runOnStartup = process.env.RUN_ON_STARTUP === 'true';

let processor;

function initializeProcessor() {
  const options = {
    model: process.env.AI_MODEL || 'gpt-4-turbo',
    dataset: process.env.BIGQUERY_DATASET || 'financial_data',
    batchSize: parseInt(process.env.BATCH_SIZE || '100'),
    confidenceThreshold: parseFloat(process.env.CONFIDENCE_THRESHOLD || '0.85')
  };

  options.concurrency = parseInt(process.env.CONCURRENCY || '3');
  options.retryAttempts = parseInt(process.env.RETRY_ATTEMPTS || '3');
  processor = new AdvancedProcessor(options);
  logger.info('Initialized AdvancedProcessor with options:', options);
}

async function runProcessing(date = null) {
  const startTime = Date.now();
  const processingId = `PROC_${Date.now()}_${Math.random().toString(36).substring(7)}`;
  
  logger.info(`Starting processing run ${processingId}`, {
    processingId,
    date: date || 'yesterday',
    processorType
  });

  try {
    const results = await processor.processWithCustomLogic(date);

    const duration = Date.now() - startTime;
    
    logger.info(`Processing completed successfully`, {
      processingId,
      duration,
      results,
      successRate: results.total > 0 ? 
        ((results.matched + results.enriched) / results.total * 100).toFixed(2) + '%' : 'N/A'
    });

    await sendNotification('success', {
      processingId,
      duration,
      results
    });

    return results;
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logger.error(`Processing failed`, {
      processingId,
      duration,
      error: error.message,
      stack: error.stack
    });

    await sendNotification('failure', {
      processingId,
      duration,
      error: error.message
    });

    throw error;
  }
}

async function sendNotification(status, details) {
  if (!process.env.NOTIFICATION_WEBHOOK) {
    return;
  }

  try {
    const notification = {
      status,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      ...details
    };

    const response = await fetch(process.env.NOTIFICATION_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(notification)
    });

    if (!response.ok) {
      logger.warn('Failed to send notification:', response.statusText);
    }
  } catch (error) {
    logger.error('Notification error:', error);
  }
}

function handleShutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully...`);
  
  if (cronJob) {
    cronJob.stop();
    logger.info('Cron job stopped');
  }
  
  // Stop pattern matching job
  patternMatchingJob.stop();

  closeMCPConnection()
    .then(() => {
      logger.info('Shutdown complete');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Error during shutdown:', error);
      process.exit(1);
    });
}

process.on('SIGTERM', () => handleShutdown('SIGTERM'));
process.on('SIGINT', () => handleShutdown('SIGINT'));

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

initializeProcessor();

let cronJob;

if (process.argv.includes('--run-now')) {
  logger.info('Running processing immediately (--run-now flag detected)');
  
  const dateArg = process.argv.find(arg => arg.startsWith('--date='));
  const date = dateArg ? dateArg.split('=')[1] : null;
  
  runProcessing(date)
    .then(() => {
      logger.info('Processing completed successfully');
      process.exit(0);
    })
    .catch(error => {
      logger.error('Processing failed:', error);
      process.exit(1);
    });
} else {
  logger.info(`Scheduling financial processor to run: ${cronSchedule}`);
  
  cronJob = cron.schedule(cronSchedule, async () => {
    await runProcessing();
  }, {
    scheduled: true,
    timezone: process.env.TZ || 'UTC'
  });

  if (runOnStartup) {
    logger.info('Running initial processing on startup');
    runProcessing().catch(error => {
      logger.error('Initial processing failed:', error);
    });
  }

  logger.info('Financial processor service started successfully');
  logger.info(`Next scheduled run: ${cronJob.nextDates(1)[0]}`);
  
  // Start pattern matching job if enabled
  if (process.env.PATTERN_MATCHING_ENABLED !== 'false') {
    patternMatchingJob.start();
    logger.info('Pattern matching job started');
  }
}