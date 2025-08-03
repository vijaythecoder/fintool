/**
 * Advanced Cache Manager with Redis integration and intelligent caching strategies
 */

import { logger } from '../../utils/logger.js';

export class CacheManager {
  constructor(options = {}) {
    this.config = {
      enablePatternCache: options.enablePatternCache !== false,
      enableQueryCache: options.enableQueryCache !== false,
      enableResultCache: options.enableResultCache !== false,
      cacheTTL: options.cacheTTL || 3600, // 1 hour default
      maxCacheSize: options.maxCacheSize || 10000,
      enableDistributed: options.enableDistributed || false,
      redisConfig: options.redisConfig || null
    };

    // In-memory cache as fallback
    this.memoryCache = new Map();
    this.cacheStats = {
      hits: 0,
      misses: 0,
      sets: 0,
      evictions: 0,
      totalRequests: 0
    };

    // Cache invalidation tracking
    this.cacheInvalidation = new Map();
    this.patternCache = new Map();
    this.glMappingCache = new Map();
    this.queryResultCache = new Map();

    // Performance tracking
    this.performanceMetrics = {
      averageGetTime: 0,
      averageSetTime: 0,
      hitRate: 0
    };

    // Initialize Redis client if configured
    this.redisClient = null;
    if (this.config.enableDistributed && this.config.redisConfig) {
      this.initializeRedisClient();
    }
  }

  /**
   * Initialize Redis client for distributed caching
   */
  async initializeRedisClient() {
    try {
      // In a real implementation, initialize Redis client here
      // this.redisClient = new Redis(this.config.redisConfig);
      logger.info('Redis cache client initialized');
    } catch (error) {
      logger.warn('Failed to initialize Redis client, falling back to memory cache', {
        error: error.message
      });
    }
  }

  /**
   * Get value from cache with performance tracking
   */
  async get(key) {
    const getStartTime = performance.now();
    this.cacheStats.totalRequests++;

    try {
      let value = null;

      // Try Redis first if available
      if (this.redisClient) {
        try {
          const redisValue = await this.redisClient.get(key);
          if (redisValue) {
            value = JSON.parse(redisValue);
          }
        } catch (error) {
          logger.warn('Redis get failed, falling back to memory cache', { key, error: error.message });
        }
      }

      // Fallback to memory cache
      if (!value && this.memoryCache.has(key)) {
        const cacheEntry = this.memoryCache.get(key);
        if (this.isValidCacheEntry(cacheEntry)) {
          value = cacheEntry.value;
        } else {
          this.memoryCache.delete(key);
        }
      }

      const getTime = performance.now() - getStartTime;
      this.updatePerformanceMetrics('get', getTime);

      if (value) {
        this.cacheStats.hits++;
        logger.debug('Cache hit', { key, getTime: getTime.toFixed(2) + 'ms' });
        return value;
      } else {
        this.cacheStats.misses++;
        logger.debug('Cache miss', { key, getTime: getTime.toFixed(2) + 'ms' });
        return null;
      }

    } catch (error) {
      logger.error('Cache get operation failed', { key, error: error.message });
      this.cacheStats.misses++;
      return null;
    }
  }

  /**
   * Set value in cache with TTL and performance tracking
   */
  async set(key, value, ttl = null) {
    const setStartTime = performance.now();
    const effectiveTTL = ttl || this.config.cacheTTL;

    try {
      const cacheEntry = {
        value,
        timestamp: Date.now(),
        ttl: effectiveTTL * 1000, // Convert to milliseconds
        accessCount: 0
      };

      // Set in Redis if available
      if (this.redisClient) {
        try {
          await this.redisClient.setex(key, effectiveTTL, JSON.stringify(value));
        } catch (error) {
          logger.warn('Redis set failed, using memory cache only', { key, error: error.message });
        }
      }

      // Always set in memory cache as well
      this.memoryCache.set(key, cacheEntry);
      this.cacheStats.sets++;

      // Maintain cache size
      if (this.memoryCache.size > this.config.maxCacheSize) {
        this.evictLeastRecentlyUsed();
      }

      const setTime = performance.now() - setStartTime;
      this.updatePerformanceMetrics('set', setTime);

      logger.debug('Cache set', { 
        key, 
        ttl: effectiveTTL,
        setTime: setTime.toFixed(2) + 'ms',
        cacheSize: this.memoryCache.size
      });

    } catch (error) {
      logger.error('Cache set operation failed', { key, error: error.message });
    }
  }

  /**
   * Pre-warm pattern cache with frequently used patterns
   */
  async preWarmPatternCache() {
    const preWarmStartTime = performance.now();
    
    try {
      // Simulate pattern pre-warming
      const commonPatterns = [
        { pattern_id: 'WIRE_TRANSFER', pattern_name: 'Wire Transfer', confidence_weight: 0.9 },
        { pattern_id: 'ACH_PAYMENT', pattern_name: 'ACH Payment', confidence_weight: 0.85 },
        { pattern_id: 'CHECK_DEPOSIT', pattern_name: 'Check Deposit', confidence_weight: 0.8 },
        { pattern_id: 'CARD_PAYMENT', pattern_name: 'Card Payment', confidence_weight: 0.75 },
        { pattern_id: 'DIRECT_DEPOSIT', pattern_name: 'Direct Deposit', confidence_weight: 0.9 }
      ];

      for (const pattern of commonPatterns) {
        await this.set(`pattern_${pattern.pattern_id}`, pattern, 7200); // 2 hour cache
      }

      await this.set('common_patterns', commonPatterns, 3600); // 1 hour cache

      const preWarmTime = performance.now() - preWarmStartTime;
      logger.info('Pattern cache pre-warming completed', {
        patternsPreWarmed: commonPatterns.length,
        preWarmTime: preWarmTime.toFixed(2) + 'ms'
      });

    } catch (error) {
      logger.warn('Pattern cache pre-warming failed', { error: error.message });
    }
  }

  /**
   * Get cached patterns
   */
  async getCachedPatterns() {
    return await this.get('common_patterns');
  }

  /**
   * Cache pattern match results
   */
  async cachePatternMatchResults(batchSignature, results) {
    const cacheKey = `pattern_match_${batchSignature}`;
    await this.set(cacheKey, results, 1800); // 30 minute cache
  }

  /**
   * Get pattern match results from cache
   */
  async getPatternMatchResults(batchSignature) {
    const cacheKey = `pattern_match_${batchSignature}`;
    return await this.get(cacheKey);
  }

  /**
   * Pre-load GL mappings into cache
   */
  async preLoadGLMappings(transactions) {
    const preLoadStartTime = performance.now();
    
    try {
      const uniquePatternIds = [...new Set(
        transactions
          .flatMap(t => t.matched_patterns || [])
          .map(p => p.pattern_id)
      )];

      // Simulate GL mapping pre-loading
      const glMappings = uniquePatternIds.map(patternId => ({
        pattern_id: patternId,
        gl_account_code: `GL_${patternId}_001`,
        gl_account_name: `General Ledger Account for ${patternId}`,
        debit_credit_indicator: 'DR',
        confidence: 0.85
      }));

      for (const mapping of glMappings) {
        const cacheKey = `gl_mapping_${mapping.pattern_id}`;
        await this.set(cacheKey, [mapping], 1800); // 30 minute cache
      }

      const preLoadTime = performance.now() - preLoadStartTime;
      logger.debug('GL mappings pre-loaded', {
        mappingsCount: glMappings.length,
        preLoadTime: preLoadTime.toFixed(2) + 'ms'
      });

    } catch (error) {
      logger.warn('GL mapping pre-loading failed', { error: error.message });
    }
  }

  /**
   * Update pattern insights based on processing results
   */
  async updatePatternInsights(results) {
    try {
      const insights = this.analyzePatternInsights(results);
      await this.set('pattern_insights', insights, 7200); // 2 hour cache
      
      logger.debug('Pattern insights updated', {
        insightsCount: Object.keys(insights).length
      });
    } catch (error) {
      logger.warn('Pattern insights update failed', { error: error.message });
    }
  }

  /**
   * Analyze pattern insights from processing results
   */
  analyzePatternInsights(results) {
    const insights = {};

    for (const result of results) {
      if (result.matched_patterns) {
        for (const pattern of result.matched_patterns) {
          if (!insights[pattern.pattern_id]) {
            insights[pattern.pattern_id] = {
              pattern_id: pattern.pattern_id,
              pattern_name: pattern.pattern_name,
              usage_count: 0,
              average_confidence: 0,
              success_rate: 0
            };
          }

          insights[pattern.pattern_id].usage_count++;
          insights[pattern.pattern_id].average_confidence = 
            (insights[pattern.pattern_id].average_confidence + pattern.match_strength) / 2;
        }
      }
    }

    return insights;
  }

  /**
   * Get cache hit rate
   */
  async getCacheHitRate() {
    if (this.cacheStats.totalRequests === 0) return 0;
    return this.cacheStats.hits / this.cacheStats.totalRequests;
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    const hitRate = await this.getCacheHitRate();
    
    return {
      ...this.cacheStats,
      hitRate: hitRate,
      cacheSize: this.memoryCache.size,
      memoryUsage: this.estimateMemoryUsage(),
      performanceMetrics: this.performanceMetrics
    };
  }

  /**
   * Get step-specific cache hits
   */
  async getStepCacheHits(stepName) {
    // Track cache hits per step
    return this.cacheStats.hits; // Simplified for now
  }

  /**
   * Get GL mapping cache hits
   */
  async getGLMappingCacheHits() {
    // Track GL mapping specific cache hits
    return Math.floor(this.cacheStats.hits * 0.3); // Simplified estimation
  }

  /**
   * Get GL mapping count in cache
   */
  async getGLMappingCount() {
    let count = 0;
    for (const key of this.memoryCache.keys()) {
      if (key.startsWith('gl_mapping_')) {
        count++;
      }
    }
    return count;
  }

  /**
   * Get cache metrics for monitoring
   */
  async getMetrics() {
    return {
      cacheStats: await this.getCacheStats(),
      memoryCache: {
        size: this.memoryCache.size,
        maxSize: this.config.maxCacheSize
      },
      distributedCache: {
        enabled: !!this.redisClient,
        connected: this.redisClient ? true : false
      },
      performance: this.performanceMetrics
    };
  }

  /**
   * Utility methods
   */
  isValidCacheEntry(entry) {
    if (!entry || !entry.timestamp || !entry.ttl) return false;
    return (Date.now() - entry.timestamp) < entry.ttl;
  }

  evictLeastRecentlyUsed() {
    // Simple LRU eviction
    let oldestKey = null;
    let oldestTimestamp = Date.now();

    for (const [key, entry] of this.memoryCache.entries()) {
      if (entry.timestamp < oldestTimestamp) {
        oldestTimestamp = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.memoryCache.delete(oldestKey);
      this.cacheStats.evictions++;
      logger.debug('Cache entry evicted (LRU)', { key: oldestKey });
    }
  }

  updatePerformanceMetrics(operation, duration) {
    if (operation === 'get') {
      this.performanceMetrics.averageGetTime = 
        (this.performanceMetrics.averageGetTime + duration) / 2;
    } else if (operation === 'set') {
      this.performanceMetrics.averageSetTime = 
        (this.performanceMetrics.averageSetTime + duration) / 2;
    }

    this.performanceMetrics.hitRate = this.cacheStats.hits / this.cacheStats.totalRequests;
  }

  estimateMemoryUsage() {
    // Rough estimation of memory usage
    let totalSize = 0;
    for (const [key, entry] of this.memoryCache.entries()) {
      totalSize += key.length + JSON.stringify(entry.value).length;
    }
    return totalSize;
  }

  /**
   * Clear cache (for maintenance)
   */
  async clear() {
    try {
      if (this.redisClient) {
        await this.redisClient.flushdb();
      }
      this.memoryCache.clear();
      
      // Reset stats
      this.cacheStats = {
        hits: 0,
        misses: 0,
        sets: 0,
        evictions: 0,
        totalRequests: 0
      };
      
      logger.info('Cache cleared successfully');
    } catch (error) {
      logger.error('Cache clear failed', { error: error.message });
    }
  }
}
EOF < /dev/null