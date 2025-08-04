import cron from 'node-cron';
import { BatchPatternProcessor } from '../processors/batchPatternProcessor.js';
import { logger } from '../utils/logger.js';
import { format } from 'date-fns';

export class PatternMatchingJob {
  constructor(options = {}) {
    this.schedule = options.schedule || process.env.PATTERN_CRON_SCHEDULE || '0 3 * * *'; // Default: 3 AM daily
    this.enabled = options.enabled !== false;
    this.task = null;
    this.isRunning = false;
    this.lastRun = null;
    this.nextRun = null;
  }

  /**
   * Start the cron job
   */
  start() {
    if (!this.enabled) {
      logger.info('Pattern matching job is disabled');
      return;
    }

    if (this.task) {
      logger.warn('Pattern matching job is already running');
      return;
    }

    logger.info(`Starting pattern matching job with schedule: ${this.schedule}`);
    
    this.task = cron.schedule(this.schedule, async () => {
      await this.run();
    }, {
      scheduled: true,
      timezone: process.env.TZ || 'UTC'
    });

    // Calculate next run time
    this.updateNextRunTime();
    logger.info(`Pattern matching job scheduled. Next run: ${this.nextRun}`);
  }

  /**
   * Stop the cron job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      this.task = null;
      logger.info('Pattern matching job stopped');
    }
  }

  /**
   * Run the pattern matching process
   */
  async run(options = {}) {
    if (this.isRunning) {
      logger.warn('Pattern matching job is already running, skipping this execution');
      return;
    }

    const jobId = `JOB_${Date.now()}_${Math.random().toString(36).substring(7)}`;
    const startTime = Date.now();
    
    this.isRunning = true;
    this.lastRun = new Date();
    
    logger.info(`Starting pattern matching job: ${jobId}`, {
      jobId,
      scheduledTime: format(new Date(), 'yyyy-MM-dd HH:mm:ss'),
      lastRun: this.lastRun
    });

    try {
      // Create processor with job-specific configuration
      const processor = new BatchPatternProcessor({
        ...options,
        jobId
      });

      // Run the batch processing
      const summary = await processor.process();
      
      // Log job completion
      await this.logJobCompletion(jobId, summary, startTime);
      
      // Send notifications if configured
      await this.sendNotifications(summary);
      
      logger.info(`Pattern matching job completed: ${jobId}`, summary);
      
      return summary;
      
    } catch (error) {
      logger.error(`Pattern matching job failed: ${jobId}`, error);
      
      // Log job failure
      await this.logJobFailure(jobId, error, startTime);
      
      // Send error notifications
      await this.sendErrorNotification(error);
      
      throw error;
      
    } finally {
      this.isRunning = false;
      this.updateNextRunTime();
    }
  }

  /**
   * Log job completion to database
   */
  async logJobCompletion(jobId, summary, startTime) {
    const duration = Date.now() - startTime;
    
    logger.info('Job completion summary:', {
      jobId,
      duration: `${(duration / 1000).toFixed(2)}s`,
      processed: summary.processed,
      succeeded: summary.succeeded,
      failed: summary.failed,
      successRate: `${summary.successRate.toFixed(1)}%`
    });
    
    // TODO: Insert into job_logs table
  }

  /**
   * Log job failure to database
   */
  async logJobFailure(jobId, error, startTime) {
    const duration = Date.now() - startTime;
    
    logger.error('Job failure summary:', {
      jobId,
      duration: `${(duration / 1000).toFixed(2)}s`,
      error: error.message,
      stack: error.stack
    });
    
    // TODO: Insert into job_logs table
  }

  /**
   * Send completion notifications
   */
  async sendNotifications(summary) {
    const webhookUrl = process.env.PATTERN_NOTIFICATION_WEBHOOK;
    if (!webhookUrl) return;
    
    try {
      const notification = {
        type: 'pattern_matching_complete',
        timestamp: new Date().toISOString(),
        summary: {
          processed: summary.processed,
          succeeded: summary.succeeded,
          failed: summary.failed,
          successRate: summary.successRate,
          duration: summary.durationFormatted,
          csvFile: summary.csvFile
        }
      };
      
      // Send webhook notification
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notification)
      });
      
      if (!response.ok) {
        logger.warn('Failed to send notification:', response.statusText);
      }
    } catch (error) {
      logger.error('Error sending notification:', error);
    }
  }

  /**
   * Send error notifications
   */
  async sendErrorNotification(error) {
    const webhookUrl = process.env.PATTERN_ERROR_WEBHOOK || process.env.PATTERN_NOTIFICATION_WEBHOOK;
    if (!webhookUrl) return;
    
    try {
      const notification = {
        type: 'pattern_matching_error',
        timestamp: new Date().toISOString(),
        error: {
          message: error.message,
          stack: error.stack
        }
      };
      
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(notification)
      });
    } catch (notificationError) {
      logger.error('Error sending error notification:', notificationError);
    }
  }

  /**
   * Update next run time
   */
  updateNextRunTime() {
    if (!this.task) {
      this.nextRun = null;
      return;
    }
    
    // Parse cron expression to calculate next run
    // For now, just estimate based on schedule
    const now = new Date();
    const tomorrow = new Date(now);
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(3, 0, 0, 0); // Assuming 3 AM daily
    
    this.nextRun = tomorrow;
  }

  /**
   * Get job status
   */
  getStatus() {
    return {
      enabled: this.enabled,
      running: this.isRunning,
      schedule: this.schedule,
      lastRun: this.lastRun,
      nextRun: this.nextRun
    };
  }

  /**
   * Run immediately (bypass schedule)
   */
  async runNow(options = {}) {
    logger.info('Running pattern matching job immediately');
    return await this.run(options);
  }
}

// Export singleton instance
export const patternMatchingJob = new PatternMatchingJob();