import { RateLimitStore, StoredEntry } from './types';

interface MemoryEntry {
  entry: StoredEntry;
  expiresAt: number;
}

/**
 * In-memory store with automatic TTL-based cleanup.
 * Suitable for single-process applications.
 */
export class MemoryStore implements RateLimitStore {
  private store = new Map<string, MemoryEntry>();
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(cleanupIntervalMs = 60_000) {
    if (cleanupIntervalMs > 0) {
      this.cleanupInterval = setInterval(() => this.cleanup(), cleanupIntervalMs);
      // Allow the process to exit even if the interval is active
      if (this.cleanupInterval.unref) {
        this.cleanupInterval.unref();
      }
    }
  }

  async get(key: string): Promise<StoredEntry | null> {
    const item = this.store.get(key);
    if (!item) return null;
    if (Date.now() > item.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return item.entry;
  }

  async set(key: string, entry: StoredEntry, ttlMs: number): Promise<void> {
    this.store.set(key, {
      entry,
      expiresAt: Date.now() + ttlMs,
    });
  }

  async delete(key: string): Promise<void> {
    this.store.delete(key);
  }

  /** Remove all expired entries. */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, item] of this.store) {
      if (now > item.expiresAt) {
        this.store.delete(key);
      }
    }
  }

  /** Stop the cleanup interval and clear all entries. */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }

  /** Current number of entries (for testing/monitoring). */
  get size(): number {
    return this.store.size;
  }
}
