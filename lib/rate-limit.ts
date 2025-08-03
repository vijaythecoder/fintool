/**
 * Rate limiting utilities for Cash Clearing API
 */

interface RateLimitConfig {
  limit: number;
  window: string; // e.g., '1h', '1m', '1d'
}

interface RateLimitResult {
  success: boolean;
  limit: number;
  remaining: number;
  reset: Date;
  retryAfter?: number;
}

class RateLimiter {
  private store: Map<string, { count: number; resetTime: number }> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  async check(
    identifier: string,
    operation: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> {
    const key = `${identifier}:${operation}`;
    const windowMs = this.parseWindow(config.window);
    const now = Date.now();
    const resetTime = now + windowMs;

    let entry = this.store.get(key);

    // Reset if window has expired
    if (!entry || now >= entry.resetTime) {
      entry = { count: 0, resetTime };
      this.store.set(key, entry);
    }

    // Check if limit exceeded
    if (entry.count >= config.limit) {
      const retryAfter = Math.ceil((entry.resetTime - now) / 1000);
      return {
        success: false,
        limit: config.limit,
        remaining: 0,
        reset: new Date(entry.resetTime),
        retryAfter
      };
    }

    // Increment counter
    entry.count++;
    this.store.set(key, entry);

    return {
      success: true,
      limit: config.limit,
      remaining: config.limit - entry.count,
      reset: new Date(entry.resetTime)
    };
  }

  private parseWindow(window: string): number {
    const match = window.match(/^(\d+)(s|m|h|d)$/);
    if (!match) {
      throw new Error(`Invalid window format: ${window}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 's': return value * 1000;
      case 'm': return value * 60 * 1000;
      case 'h': return value * 60 * 60 * 1000;
      case 'd': return value * 24 * 60 * 60 * 1000;
      default: throw new Error(`Unknown time unit: ${unit}`);
    }
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (now >= entry.resetTime) {
        this.store.delete(key);
      }
    }
  }

  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }
}

// Singleton instance
let rateLimiterInstance: RateLimiter | null = null;

export const rateLimit = {
  check: async (
    identifier: string,
    operation: string,
    config: RateLimitConfig
  ): Promise<RateLimitResult> => {
    if (!rateLimiterInstance) {
      rateLimiterInstance = new RateLimiter();
    }
    return rateLimiterInstance.check(identifier, operation, config);
  },

  destroy: () => {
    if (rateLimiterInstance) {
      rateLimiterInstance.destroy();
      rateLimiterInstance = null;
    }
  }
};

// Default rate limit configurations
export const defaultRateLimits = {
  'workflow-start': { limit: 5, window: '1h' },
  'workflow-status': { limit: 100, window: '1h' },
  'workflow-control': { limit: 10, window: '1h' },
  'transaction-read': { limit: 1000, window: '1h' },
  'transaction-process': { limit: 50, window: '1h' },
  'approval-read': { limit: 500, window: '1h' },
  'approval-action': { limit: 200, window: '1h' },
  'approval-batch': { limit: 20, window: '1h' },
  'metrics-read': { limit: 100, window: '1h' },
  'audit-read': { limit: 200, window: '1h' }
} as const;

// Rate limit middleware helper
export function createRateLimitMiddleware(
  operation: keyof typeof defaultRateLimits,
  customConfig?: RateLimitConfig
) {
  return async (identifier: string) => {
    const config = customConfig || defaultRateLimits[operation];
    return await rateLimit.check(identifier, operation, config);
  };
}