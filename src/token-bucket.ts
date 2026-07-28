import { RateLimiter, RateLimitConfig, RateLimitResult, RateLimitStore, StoredEntry } from './types';
import { MemoryStore } from './memory-store';

/**
 * Token Bucket rate limiter.
 *
 * Tokens are added at a constant rate up to the maximum (limit).
 * Each request consumes one token. If no tokens are available, the
 * request is denied.
 *
 * This algorithm allows short bursts up to the limit while maintaining
 * an average rate over time.
 */
export class TokenBucket implements RateLimiter {
  private readonly config: RateLimitConfig;
  private readonly store: RateLimitStore;
  private readonly refillRate: number; // tokens per ms

  constructor(config: RateLimitConfig, store?: RateLimitStore) {
    this.config = config;
    this.store = store ?? new MemoryStore();
    this.refillRate = config.limit / config.window;
  }

  async consume(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = await this.getOrCreate(key, now);

    // Refill tokens based on elapsed time
    const elapsed = now - entry.lastRefill;
    const refilled = Math.min(
      this.config.limit,
      entry.tokens + elapsed * this.refillRate
    );

    if (refilled < 1) {
      // Not enough tokens
      const waitMs = Math.ceil((1 - refilled) / this.refillRate);
      return {
        allowed: false,
        remaining: 0,
        limit: this.config.limit,
        resetAt: now + waitMs,
        retryAfter: waitMs,
      };
    }

    // Consume one token
    const newTokens = refilled - 1;
    await this.store.set(
      key,
      { tokens: newTokens, lastRefill: now, windowStart: entry.windowStart, count: entry.count + 1 },
      this.config.window
    );

    return {
      allowed: true,
      remaining: Math.floor(newTokens),
      limit: this.config.limit,
      resetAt: now + Math.ceil((this.config.limit - newTokens) / this.refillRate),
      retryAfter: 0,
    };
  }

  async peek(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const entry = await this.getOrCreate(key, now);

    const elapsed = now - entry.lastRefill;
    const current = Math.min(
      this.config.limit,
      entry.tokens + elapsed * this.refillRate
    );

    const remaining = Math.floor(current);
    const retryAfter = current < 1
      ? Math.ceil((1 - current) / this.refillRate)
      : 0;

    return {
      allowed: current >= 1,
      remaining,
      limit: this.config.limit,
      resetAt: now + Math.ceil((this.config.limit - current) / this.refillRate),
      retryAfter,
    };
  }

  async reset(key: string): Promise<void> {
    await this.store.delete(key);
  }

  private async getOrCreate(key: string, now: number): Promise<StoredEntry> {
    const existing = await this.store.get(key);
    if (existing) return existing;

    const fresh: StoredEntry = {
      tokens: this.config.limit,
      lastRefill: now,
      windowStart: now,
      count: 0,
    };
    await this.store.set(key, fresh, this.config.window);
    return fresh;
  }
}
