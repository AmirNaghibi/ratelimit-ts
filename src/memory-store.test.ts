import { MemoryStore } from './memory-store';

describe('MemoryStore', () => {
  it('stores and retrieves entries', async () => {
    const store = new MemoryStore(0);
    const entry = { tokens: 5, lastRefill: Date.now(), windowStart: Date.now(), count: 1 };

    await store.set('key1', entry, 5000);
    const result = await store.get('key1');

    expect(result).toEqual(entry);
    store.destroy();
  });

  it('returns null for missing keys', async () => {
    const store = new MemoryStore(0);
    const result = await store.get('nonexistent');
    expect(result).toBeNull();
    store.destroy();
  });

  it('expires entries after TTL', async () => {
    const store = new MemoryStore(0);
    const entry = { tokens: 5, lastRefill: Date.now(), windowStart: Date.now(), count: 1 };

    await store.set('key1', entry, 50); // 50ms TTL
    await sleep(80);

    const result = await store.get('key1');
    expect(result).toBeNull();
    store.destroy();
  });

  it('deletes entries', async () => {
    const store = new MemoryStore(0);
    const entry = { tokens: 5, lastRefill: Date.now(), windowStart: Date.now(), count: 1 };

    await store.set('key1', entry, 5000);
    await store.delete('key1');

    const result = await store.get('key1');
    expect(result).toBeNull();
    store.destroy();
  });

  it('reports size correctly', async () => {
    const store = new MemoryStore(0);
    const entry = { tokens: 5, lastRefill: Date.now(), windowStart: Date.now(), count: 1 };

    expect(store.size).toBe(0);
    await store.set('a', entry, 5000);
    expect(store.size).toBe(1);
    await store.set('b', entry, 5000);
    expect(store.size).toBe(2);
    await store.delete('a');
    expect(store.size).toBe(1);
    store.destroy();
  });

  it('cleanup removes expired entries', async () => {
    // Short cleanup interval for testing
    const store = new MemoryStore(30);
    const entry = { tokens: 5, lastRefill: Date.now(), windowStart: Date.now(), count: 1 };

    await store.set('expire-fast', entry, 20);
    await store.set('keep', entry, 5000);

    await sleep(60); // Wait for cleanup to run

    expect(store.size).toBe(1); // Only 'keep' should remain
    store.destroy();
  });

  it('destroy clears everything', async () => {
    const store = new MemoryStore(0);
    const entry = { tokens: 5, lastRefill: Date.now(), windowStart: Date.now(), count: 1 };

    await store.set('a', entry, 5000);
    await store.set('b', entry, 5000);

    store.destroy();
    expect(store.size).toBe(0);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
