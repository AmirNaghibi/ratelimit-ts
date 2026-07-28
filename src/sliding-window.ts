import { RateLimiter, RateLimitConfig, RateLimitResult, RateLimitStore, StoredEntry } from './types';
import { MemoryStore } from './memory-store';

/**
 * Sliding Window Counter rate limiter.
 *
 * Approximates a sliding window by combining the count from the previous
 * fixed window (weighted by overlap) with the current window's count.
 * More accurate than fixed window at boundaries, with minimal overhead.
 */
export class SlidingWindow implements RateLimiter {
  private readonly config: RateLimitConfig;
  private readonly store: RateLimitStore;

  constructor(config: RateLimitConfig, store?: RateLimitStore) {
    this.config = config;
    this.store = store ?? new MemoryStore();
  }

  async consume(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const currentWindowStart = this.windowStart(now);
    const prevKey = `${key}:prev`;
    const currKey = `${key}:curr`;

    const [prev, curr] = await Promise.all([
      this.store.get(prevKey),
      this.store.get(currKey),
    ]);

    // Roll window if needed
    const prevCount = this.getPrevCount(prev, curr, currentWindowStart);
    const currCount = curr && curr.windowStart === currentWindowStart ? curr.count : 0;

    // Calculate weighted estimate
    const elapsed = now - currentWindowStart;
    const weight = 1 - elapsed / this.config.window;
    const estimate = Math.floor(prevCount * weight) + currCount;

    if (estimate >= this.config.limit) {
      const resetAt = currentWindowStart + this.config.window;
      return {
        allowed: false,
        remaining: 0,
        limit: this.config.limit,
        resetAt,
        retryAfter: resetAt - now,
      };
    }

    // Consume: increment current window
    const newCount = currCount + 1;
    await this.store.set(
      currKey,
      { tokens: 0, lastRefill: now, windowStart: currentWindowStart, count: newCount },
      this.config.window * 2
    );

    // Store previous window data if rolling
    if (curr && curr.windowStart !== currentWindowStart) {
      await this.store.set(
        prevKey,
        { tokens: 0, lastRefill: curr.lastRefill, windowStart: curr.windowStart, count: curr.count },
        this.config.window
      );
    }

    const newEstimate = Math.floor(prevCount * weight) + newCount;
    const remaining = Math.max(0, this.config.limit - newEstimate);

    return {
      allowed: true,
      remaining,
      limit: this.config.limit,
      resetAt: currentWindowStart + this.config.window,
      retryAfter: 0,
    };
  }

  async peek(key: string): Promise<RateLimitResult> {
    const now = Date.now();
    const currentWindowStart = this.windowStart(now);
    const prevKey = `${key}:prev`;
    const currKey = `${key}:curr`;

    const [prev, curr] = await Promise.all([
      this.store.get(prevKey),
      this.store.get(currKey),
    ]);

    const prevCount = this.getPrevCount(prev, curr, currentWindowStart);
    const currCount = curr && curr.windowStart === currentWindowStart ? curr.count : 0;

    const elapsed = now - currentWindowStart;
    const weight = 1 - elapsed / this.config.window;
    const estimate = Math.floor(prevCount * weight) + currCount;
    const remaining = Math.max(0, this.config.limit - estimate);
    const resetAt = currentWindowStart + this.config.window;

    return {
      allowed: remaining > 0,
      remaining,
      limit: this.config.limit,
      resetAt,
      retryAfter: remaining > 0 ? 0 : resetAt - now,
    };
  }

  async reset(key: string): Promise<void> {
    await Promise.all([
      this.store.delete(`${key}:prev`),
      this.store.delete(`${key}:curr`),
    ]);
  }

  private windowStart(now: number): number {
    return now - (now % this.config.window);
  }

  private getPrevCount(
    prev: StoredEntry | null,
    curr: StoredEntry | null,
    currentWindowStart: number
  ): number {
    // If curr is from the previous window, it becomes "prev"
    if (curr && curr.windowStart !== currentWindowStart) {
      return curr.count;
    }
    // Otherwise use the stored prev
    if (prev && prev.windowStart === currentWindowStart - this.config.window) {
      return prev.count;
    }
    return 0;
  }
}
