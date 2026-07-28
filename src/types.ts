/**
 * Result of a rate limit check.
 */
export interface RateLimitResult {
  /** Whether the request is allowed. */
  allowed: boolean;
  /** Remaining tokens/requests in the current window. */
  remaining: number;
  /** Total limit for the window. */
  limit: number;
  /** Unix timestamp (ms) when the limit resets. */
  resetAt: number;
  /** Milliseconds until a retry would succeed (0 if allowed). */
  retryAfter: number;
}

/**
 * Configuration for a rate limiter.
 */
export interface RateLimitConfig {
  /** Maximum number of requests allowed in the window. */
  limit: number;
  /** Window duration in milliseconds. */
  window: number;
}

/**
 * Interface for a rate limiter instance.
 */
export interface RateLimiter {
  /** Check and consume a token for the given key. */
  consume(key: string): Promise<RateLimitResult>;
  /** Check without consuming (peek at current state). */
  peek(key: string): Promise<RateLimitResult>;
  /** Reset the state for a given key. */
  reset(key: string): Promise<void>;
}

/**
 * Storage backend interface for rate limit state.
 */
export interface RateLimitStore {
  get(key: string): Promise<StoredEntry | null>;
  set(key: string, entry: StoredEntry, ttlMs: number): Promise<void>;
  delete(key: string): Promise<void>;
}

/**
 * Internal stored state for a rate limit entry.
 */
export interface StoredEntry {
  tokens: number;
  lastRefill: number;
  windowStart: number;
  count: number;
}
