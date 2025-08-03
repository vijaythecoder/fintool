/**
 * BigQuery Query Optimizer
 * Implements advanced query optimization techniques for high-performance processing
 */

import { logger } from '../utils/logger.js';

export class QueryOptimizer {
  constructor(options = {}) {
    this.config = {
      enablePartitioning: options.enablePartitioning !== false,
      enableClustering: options.enableClustering !== false,
      cacheQueryPlans: options.cacheQueryPlans !== false,
      indexOptimization: options.indexOptimization !== false,
      maxQueryCacheSize: options.maxQueryCacheSize || 1000
    };

    // Query plan cache
    this.queryPlanCache = new Map();
    this.compiledQueries = new Map();
    this.queryMetrics = new Map();
    
    // Optimization statistics
    this.optimizationStats = {
      queriesOptimized: 0,
      averageOptimizationGain: 0,
      cacheHits: 0,
      partitionPruningCount: 0
    };
  }

  /**
   * Build optimized transaction query with partitioning and clustering
   */
  async buildOptimizedTransactionQuery(pattern, batchSize, options = {}) {
    const optionsStr = JSON.stringify(options);
    const queryKey = `transactions_${pattern}_${batchSize}_${optionsStr}`;
    
    // Check for cached compiled query
    if (this.compiledQueries.has(queryKey)) {
      this.optimizationStats.cacheHits++;
      logger.debug('Using cached optimized query', { queryKey });
      return this.compiledQueries.get(queryKey);
    }

    const optimizationStartTime = performance.now();
    
    try {
      // Build base query with optimizations
      let optimizedQuery = this.buildBaseTransactionQuery(pattern, batchSize);
      
      // Apply partition pruning
      if (options.enablePartitionPruning && this.config.enablePartitioning) {
        optimizedQuery = this.addPartitionPruning(optimizedQuery);
      }
      
      // Apply clustering optimizations
      if (options.enableClustering && this.config.enableClustering) {
        optimizedQuery = this.addClusteringOptimizations(optimizedQuery);
      }
      
      // Apply pre-aggregation hints
      if (options.usePreAggregation) {
        optimizedQuery = this.addPreAggregationHints(optimizedQuery);
      }
      
      // Add query optimization hints
      optimizedQuery = this.addQueryHints(optimizedQuery);
      
      // Cache the compiled query
      this.compiledQueries.set(queryKey, optimizedQuery);
      
      // Maintain cache size
      if (this.compiledQueries.size > this.config.maxQueryCacheSize) {
        const firstKey = this.compiledQueries.keys().next().value;
        this.compiledQueries.delete(firstKey);
      }
      
      const optimizationTime = performance.now() - optimizationStartTime;
      this.optimizationStats.queriesOptimized++;
      
      logger.debug('Query optimization completed', {
        queryKey,
        optimizationTime: optimizationTime.toFixed(2) + 'ms',
        optimizations: {
          partitionPruning: options.enablePartitionPruning,
          clustering: options.enableClustering,
          preAggregation: options.usePreAggregation
        }
      });
      
      return optimizedQuery;
      
    } catch (error) {
      logger.error('Query optimization failed', { error: error.message, queryKey });
      return this.buildBaseTransactionQuery(pattern, batchSize); // Fallback to basic query
    }
  }

  /**
   * Build base transaction query
   */
  buildBaseTransactionQuery(pattern, batchSize) {
    return `
      SELECT 
        transaction_id,
        amount,
        transaction_date,
        description,
        reference_number,
        merchant_name,
        account_id,
        currency_code,
        transaction_type,
        status,
        created_at,
        updated_at
      FROM \`\${dataset}.cash_transactions\`
      WHERE status = '${pattern}'
        AND DATE(transaction_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 30 DAY)
      ORDER BY transaction_date DESC, amount DESC
      LIMIT ${batchSize}
    `;
  }

  /**
   * Add partition pruning for better performance
   */
  addPartitionPruning(query) {
    // Add partition filters to reduce scan overhead
    const partitionOptimizedQuery = query.replace(
      'WHERE status =',
      `WHERE _PARTITIONTIME >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 7 DAY)
        AND DATE(transaction_date) >= DATE_SUB(CURRENT_DATE(), INTERVAL 7 DAY)
        AND status =`
    );
    
    this.optimizationStats.partitionPruningCount++;
    
    logger.debug('Added partition pruning optimization');
    return partitionOptimizedQuery;
  }

  /**
   * Add clustering optimizations
   */
  addClusteringOptimizations(query) {
    // Optimize ORDER BY to align with clustering columns
    const clusterOptimizedQuery = query.replace(
      'ORDER BY transaction_date DESC, amount DESC',
      'ORDER BY status, transaction_date DESC, amount DESC'
    );
    
    logger.debug('Added clustering optimization');
    return clusterOptimizedQuery;
  }

  /**
   * Add pre-aggregation hints
   */
  addPreAggregationHints(query) {
    // Add materialized view hints for common aggregations
    const preAggregatedQuery = query.replace(
      'FROM `${dataset}.cash_transactions`',
      `FROM \`\${dataset}.cash_transactions\`
       /* Use materialized view if available: mv_cash_transactions_daily */`
    );
    
    logger.debug('Added pre-aggregation hints');
    return preAggregatedQuery;
  }

  /**
   * Add BigQuery optimization hints
   */
  addQueryHints(query) {
    const hintedQuery = `
      -- Query optimization hints
      -- @optimizer_hints: BATCH_MODE=true, USE_PARTITION_PRUNING=true
      ${query}
    `;
    
    return hintedQuery;
  }

  /**
   * Pre-compile frequently used queries
   */
  async preCompileQueries() {
    const preCompileStartTime = performance.now();
    
    try {
      // Pre-compile common transaction queries
      await Promise.all([
        this.buildOptimizedTransactionQuery('T_NOTFOUND', 100, { enablePartitionPruning: true }),
        this.buildOptimizedTransactionQuery('T_NOTFOUND', 500, { enablePartitionPruning: true }),
        this.buildOptimizedTransactionQuery('T_NOTFOUND', 1000, { enablePartitionPruning: true })
      ]);
      
      const preCompileTime = performance.now() - preCompileStartTime;
      
      logger.info('Query pre-compilation completed', {
        queriesCompiled: this.compiledQueries.size,
        preCompileTime: preCompileTime.toFixed(2) + 'ms'
      });
      
    } catch (error) {
      logger.warn('Query pre-compilation partially failed', { error: error.message });
    }
  }

  /**
   * Get optimization metrics
   */
  async getMetrics() {
    return {
      optimizationStats: this.optimizationStats,
      cacheSize: this.compiledQueries.size,
      queryMetricsCount: this.queryMetrics.size,
      averageOptimizationGain: this.calculateAverageOptimizationGain(),
      recommendations: this.getGlobalOptimizationRecommendations()
    };
  }

  /**
   * Calculate average optimization gain
   */
  calculateAverageOptimizationGain() {
    if (this.queryMetrics.size === 0) return 0;
    
    let totalGain = 0;
    let count = 0;
    
    for (const analysis of this.queryMetrics.values()) {
      if (analysis.baselineTime && analysis.optimizedTime) {
        const gain = (analysis.baselineTime - analysis.optimizedTime) / analysis.baselineTime;
        totalGain += gain;
        count++;
      }
    }
    
    return count > 0 ? (totalGain / count) * 100 : 0; // Return as percentage
  }

  /**
   * Get global optimization recommendations
   */
  getGlobalOptimizationRecommendations() {
    const recommendations = [];
    
    if (this.optimizationStats.partitionPruningCount < this.optimizationStats.queriesOptimized * 0.5) {
      recommendations.push({
        type: 'INFRASTRUCTURE',
        priority: 'HIGH',
        suggestion: 'Enable partition pruning for more queries to improve performance'
      });
    }
    
    if (this.optimizationStats.cacheHits / this.optimizationStats.queriesOptimized < 0.3) {
      recommendations.push({
        type: 'CACHING',
        priority: 'MEDIUM',
        suggestion: 'Query cache hit rate is low. Consider increasing cache size or optimizing query patterns'
      });
    }
    
    return recommendations;
  }
}
EOF < /dev/null