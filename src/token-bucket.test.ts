import { TokenBucket } from './token-bucket';
import { MemoryStore } from './memory-store';

describe('TokenBucket', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore(0); // disable auto-cleanup in tests
  });

  afterEach(() => {
    store.destroy();
  });

  it('allows requests within the limit', async () => {
    const limiter = new TokenBucket({ limit: 5, window: 1000 }, store);

    for (let i = 0; i < 5; i++) {
      const result = await limiter.consume('user1');
      expect(result.allowed).toBe(true);
      expect(result.remaining).toBe(4 - i);
    }
  });

  it('denies requests exceeding the limit', async () => {
    const limiter = new TokenBucket({ limit: 3, window: 10000 }, store);

    // Consume all tokens
    for (let i = 0; i < 3; i++) {
      await limiter.consume('user1');
    }

    const result = await limiter.consume('user1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('refills tokens over time', async () => {
    const limiter = new TokenBucket({ limit: 2, window: 200 }, store);

    // Use both tokens
    await limiter.consume('user1');
    await limiter.consume('user1');

    const denied = await limiter.consume('user1');
    expect(denied.allowed).toBe(false);

    // Wait for refill (at least 1 token)
    await sleep(120);

    const allowed = await limiter.consume('user1');
    expect(allowed.allowed).toBe(true);
  });

  it('isolates keys from each other', async () => {
    const limiter = new TokenBucket({ limit: 2, window: 10000 }, store);

    await limiter.consume('user1');
    await limiter.consume('user1');

    const user1 = await limiter.consume('user1');
    const user2 = await limiter.consume('user2');

    expect(user1.allowed).toBe(false);
    expect(user2.allowed).toBe(true);
  });

  it('peek does not consume tokens', async () => {
    const limiter = new TokenBucket({ limit: 3, window: 10000 }, store);

    const peek1 = await limiter.peek('user1');
    expect(peek1.allowed).toBe(true);
    expect(peek1.remaining).toBe(3);

    const peek2 = await limiter.peek('user1');
    expect(peek2.remaining).toBe(3); // unchanged
  });

  it('reset restores full capacity', async () => {
    const limiter = new TokenBucket({ limit: 3, window: 10000 }, store);

    await limiter.consume('user1');
    await limiter.consume('user1');
    await limiter.consume('user1');

    await limiter.reset('user1');

    const result = await limiter.consume('user1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(2); // 3 - 1
  });

  it('reports correct limit in results', async () => {
    const limiter = new TokenBucket({ limit: 10, window: 1000 }, store);
    const result = await limiter.consume('user1');
    expect(result.limit).toBe(10);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
