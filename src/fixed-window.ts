import { RateLimiter, RateLimitConfig, RateLimitResult, RateLimitStore, StoredEntry } from './types';
import { MemoryStore } from './memory-store';

/**
 * Fixed Window rate limiter.
 *
 * Divides time into fixed windows and counts requests per window.
 * Simple and memory-efficient, but can allow up to 2x burst at
 * window boundaries.
 */
export class FixedWindow implements RateLimiter {
  private readonly config: RateLimitConfig;
  private readonly store: RateLimitStore;

  constructor(config: RateLimitConfig, store?: RateLimitStore) {
    this.config = config;
    this.store = store ?? new MemoryStore();
  }

  async consume(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = this.currentWindowStart(now);
    const entry = await this.getOrCreate(key, now, windowStart);

    // Check if we're in a new window
    if (entry.windowStart !== windowStart) {
      // New window, reset count
      const fresh: StoredEntry = {
        tokens: this.config.limit - 1,
        lastRefill: now,
        windowStart,
        count: 1,
      };
      await this.store.set(key, fresh, this.config.window);
      return {
        allowed: true,
        remaining: this.config.limit - 1,
        limit: this.config.limit,
        resetAt: windowStart + this.config.window,
        retryAfter: 0,
      };
    }

    // Same window
    if (entry.count >= this.config.limit) {
      const resetAt = windowStart + this.config.window;
      return {
        allowed: false,
        remaining: 0,
        limit: this.config.limit,
        resetAt,
        retryAfter: resetAt - now,
      };
    }

    // Consume
    const updated: StoredEntry = {
      tokens: this.config.limit - (entry.count + 1),
      lastRefill: now,
      windowStart: entry.windowStart,
      count: entry.count + 1,
    };
    await this.store.set(key, updated, this.config.window);

    return {
      allowed: true,
      remaining: this.config.limit - updated.count,
      limit: this.config.limit,
      resetAt: windowStart + this.config.window,
      retryAfter: 0,
    };
  }

  async peek(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const windowStart = this.currentWindowStart(now);
    const entry = await this.store.get(key);

    if (!entry || entry.windowStart !== windowStart) {
      return {
        allowed: true,
        remaining: this.config.limit,
        limit: this.config.limit,
        resetAt: windowStart + this.config.window,
        retryAfter: 0,
      };
    }

    const remaining = Math.max(0, this.config.limit - entry.count);
    const resetAt = windowStart + this.config.window;

    return {
      allowed: remaining > 0,
      remaining,
      limit: this.config.limit,
      resetAt,
      retryAfter: remaining > 0 ? 0 : resetAt - now,
    };
  }

  async reset(key: string): Promise<void> {
    await this.store.delete(key);
  }

  private currentWindowStart(now: number): number {
    return now - (now % this.config.window);
  }

  private async getOrCreate(key: string, now: number, windowStart: number): Promise<StoredEntry> {
    const existing = await this.store.get(key);
    if (existing) return existing;

    const fresh: StoredEntry = {
      tokens: this.config.limit,
      lastRefill: now,
      windowStart,
      count: 0,
    };
    await this.store.set(key, fresh, this.config.window);
    return fresh;
  }
}
