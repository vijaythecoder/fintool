import { promises as fs } from 'fs';
import path from 'path';

export class ProgressTracker {
  constructor(options = {}) {
    this.totalItems = options.totalItems || 0;
    this.processedItems = 0;
    this.failedItems = 0;
    this.startTime = null;
    this.batchSize = options.batchSize || 100;
    this.progressFile = options.progressFile || null;
    this.checkpointInterval = options.checkpointInterval || 1000; // Save progress every N items
    this.lastCheckpoint = 0;
    this.batches = [];
    this.onProgress = options.onProgress || (() => {});
  }

  /**
   * Start tracking
   */
  start(totalItems = null) {
    if (totalItems) this.totalItems = totalItems;
    this.startTime = Date.now();
    this.log(`Starting processing of ${this.totalItems} items`);
  }

  /**
   * Update progress
   */
  async update(processed, failed = 0) {
    this.processedItems += processed;
    this.failedItems += failed;
    
    const progress = this.getProgress();
    this.onProgress(progress);
    
    // Save checkpoint if needed
    if (this.progressFile && 
        this.processedItems - this.lastCheckpoint >= this.checkpointInterval) {
      await this.saveCheckpoint();
      this.lastCheckpoint = this.processedItems;
    }
    
    this.log(`Progress: ${progress.percentage.toFixed(1)}% (${this.processedItems}/${this.totalItems})`);
  }

  /**
   * Record batch completion
   */
  recordBatch(batchId, itemCount, success = true, error = null) {
    const batch = {
      id: batchId,
      itemCount,
      success,
      error: error ? error.message : null,
      timestamp: new Date().toISOString()
    };
    
    this.batches.push(batch);
    
    if (success) {
      this.update(itemCount, 0);
    } else {
      this.update(0, itemCount);
    }
  }

  /**
   * Get current progress
   */
  getProgress() {
    const elapsed = this.startTime ? Date.now() - this.startTime : 0;
    const percentage = this.totalItems > 0 
      ? (this.processedItems / this.totalItems) * 100 
      : 0;
    
    const itemsPerSecond = elapsed > 0 
      ? this.processedItems / (elapsed / 1000) 
      : 0;
    
    const remainingItems = this.totalItems - this.processedItems;
    const estimatedTimeRemaining = itemsPerSecond > 0 
      ? (remainingItems / itemsPerSecond) * 1000 
      : 0;

    return {
      totalItems: this.totalItems,
      processedItems: this.processedItems,
      failedItems: this.failedItems,
      successItems: this.processedItems - this.failedItems,
      percentage,
      elapsed,
      itemsPerSecond,
      estimatedTimeRemaining,
      batchesCompleted: this.batches.filter(b => b.success).length,
      batchesFailed: this.batches.filter(b => !b.success).length
    };
  }

  /**
   * Get formatted progress string
   */
  getProgressString() {
    const progress = this.getProgress();
    const elapsed = this.formatDuration(progress.elapsed);
    const remaining = this.formatDuration(progress.estimatedTimeRemaining);
    
    return [
      `Progress: ${progress.percentage.toFixed(1)}%`,
      `Processed: ${progress.processedItems}/${progress.totalItems}`,
      `Success: ${progress.successItems}`,
      `Failed: ${progress.failedItems}`,
      `Speed: ${progress.itemsPerSecond.toFixed(1)} items/sec`,
      `Elapsed: ${elapsed}`,
      `Remaining: ${remaining}`
    ].join(' | ');
  }

  /**
   * Save progress checkpoint
   */
  async saveCheckpoint() {
    if (!this.progressFile) return;
    
    const checkpoint = {
      timestamp: new Date().toISOString(),
      progress: this.getProgress(),
      batches: this.batches,
      lastProcessedId: this.lastProcessedId || null
    };
    
    const dir = path.dirname(this.progressFile);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(
      this.progressFile, 
      JSON.stringify(checkpoint, null, 2),
      'utf8'
    );
  }

  /**
   * Load progress checkpoint
   */
  async loadCheckpoint() {
    if (!this.progressFile) return null;
    
    try {
      const content = await fs.readFile(this.progressFile, 'utf8');
      const checkpoint = JSON.parse(content);
      
      this.processedItems = checkpoint.progress.processedItems;
      this.failedItems = checkpoint.progress.failedItems;
      this.batches = checkpoint.batches || [];
      this.lastProcessedId = checkpoint.lastProcessedId;
      
      return checkpoint;
    } catch (error) {
      // No checkpoint file exists
      return null;
    }
  }

  /**
   * Complete tracking
   */
  async complete() {
    const progress = this.getProgress();
    const summary = {
      ...progress,
      completedAt: new Date().toISOString(),
      duration: this.formatDuration(progress.elapsed),
      averageSpeed: progress.itemsPerSecond.toFixed(1) + ' items/sec',
      successRate: ((progress.successItems / progress.processedItems) * 100).toFixed(1) + '%'
    };
    
    this.log(`\nProcessing completed:`);
    this.log(`- Total processed: ${summary.processedItems}`);
    this.log(`- Success: ${summary.successItems}`);
    this.log(`- Failed: ${summary.failedItems}`);
    this.log(`- Duration: ${summary.duration}`);
    this.log(`- Average speed: ${summary.averageSpeed}`);
    this.log(`- Success rate: ${summary.successRate}`);
    
    // Save final checkpoint
    if (this.progressFile) {
      await this.saveCheckpoint();
    }
    
    return summary;
  }

  /**
   * Format duration
   */
  formatDuration(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    } else {
      return `${seconds}s`;
    }
  }

  /**
   * Log message
   */
  log(message) {
    console.log(`[${new Date().toISOString()}] ${message}`);
  }

  /**
   * Set last processed ID for resumption
   */
  setLastProcessedId(id) {
    this.lastProcessedId = id;
  }

  /**
   * Get estimated completion time
   */
  getEstimatedCompletionTime() {
    const progress = this.getProgress();
    if (progress.estimatedTimeRemaining > 0) {
      const completionTime = new Date(Date.now() + progress.estimatedTimeRemaining);
      return completionTime.toISOString();
    }
    return null;
  }
}