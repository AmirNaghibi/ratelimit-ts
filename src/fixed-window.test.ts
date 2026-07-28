import { FixedWindow } from './fixed-window';
import { MemoryStore } from './memory-store';

describe('FixedWindow', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore(0);
  });

  afterEach(() => {
    store.destroy();
  });

  it('allows requests within the limit', async () => {
    const limiter = new FixedWindow({ limit: 5, window: 10000 }, store);

    for (let i = 0; i < 5; i++) {
      const result = await limiter.consume('user1');
      expect(result.allowed).toBe(true);
    }
  });

  it('denies requests exceeding the limit', async () => {
    const limiter = new FixedWindow({ limit: 3, window: 10000 }, store);

    for (let i = 0; i < 3; i++) {
      await limiter.consume('user1');
    }

    const result = await limiter.consume('user1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('resets at window boundary', async () => {
    const limiter = new FixedWindow({ limit: 2, window: 100 }, store);

    await limiter.consume('user1');
    await limiter.consume('user1');

    const denied = await limiter.consume('user1');
    expect(denied.allowed).toBe(false);

    // Wait for new window
    await sleep(150);

    const allowed = await limiter.consume('user1');
    expect(allowed.allowed).toBe(true);
  });

  it('tracks remaining correctly', async () => {
    const limiter = new FixedWindow({ limit: 5, window: 10000 }, store);

    const r1 = await limiter.consume('user1');
    expect(r1.remaining).toBe(4);

    const r2 = await limiter.consume('user1');
    expect(r2.remaining).toBe(3);
  });

  it('peek does not consume', async () => {
    const limiter = new FixedWindow({ limit: 3, window: 10000 }, store);

    await limiter.consume('user1');

    const peek = await limiter.peek('user1');
    expect(peek.remaining).toBe(2);

    const peek2 = await limiter.peek('user1');
    expect(peek2.remaining).toBe(2); // unchanged
  });

  it('reset clears state', async () => {
    const limiter = new FixedWindow({ limit: 2, window: 10000 }, store);

    await limiter.consume('user1');
    await limiter.consume('user1');

    await limiter.reset('user1');

    const result = await limiter.consume('user1');
    expect(result.allowed).toBe(true);
  });

  it('provides resetAt timestamp', async () => {
    const limiter = new FixedWindow({ limit: 5, window: 10000 }, store);
    const result = await limiter.consume('user1');
    expect(result.resetAt).toBeGreaterThan(Date.now());
    expect(result.resetAt).toBeLessThanOrEqual(Date.now() + 10000);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
