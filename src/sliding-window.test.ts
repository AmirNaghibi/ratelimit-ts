import { SlidingWindow } from './sliding-window';
import { MemoryStore } from './memory-store';

describe('SlidingWindow', () => {
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore(0);
  });

  afterEach(() => {
    store.destroy();
  });

  it('allows requests within the limit', async () => {
    const limiter = new SlidingWindow({ limit: 5, window: 10000 }, store);

    for (let i = 0; i < 5; i++) {
      const result = await limiter.consume('user1');
      expect(result.allowed).toBe(true);
    }
  });

  it('denies requests exceeding the limit', async () => {
    const limiter = new SlidingWindow({ limit: 3, window: 10000 }, store);

    for (let i = 0; i < 3; i++) {
      await limiter.consume('user1');
    }

    const result = await limiter.consume('user1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('accounts for previous window weight', async () => {
    // With a short window, fill up, then move to next window
    const limiter = new SlidingWindow({ limit: 4, window: 100 }, store);

    // Fill current window
    for (let i = 0; i < 4; i++) {
      await limiter.consume('user1');
    }

    // Move to next window (just barely into it)
    await sleep(110);

    // The previous window's count should still weigh in
    // At 10ms into new window: weight = 1 - 10/100 = 0.9
    // estimate = floor(4 * 0.9) + 0 = 3
    // So we should have room for 1 more (limit 4 - estimate 3 = 1)
    const result = await limiter.consume('user1');
    expect(result.allowed).toBe(true);
  });

  it('fully resets after full window passes', async () => {
    const limiter = new SlidingWindow({ limit: 2, window: 50 }, store);

    await limiter.consume('user1');
    await limiter.consume('user1');

    // Wait for 2 full windows to pass (prev window fully expires)
    await sleep(120);

    const result = await limiter.consume('user1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThanOrEqual(0);
  });

  it('isolates different keys', async () => {
    const limiter = new SlidingWindow({ limit: 2, window: 10000 }, store);

    await limiter.consume('user1');
    await limiter.consume('user1');

    const user1 = await limiter.consume('user1');
    const user2 = await limiter.consume('user2');

    expect(user1.allowed).toBe(false);
    expect(user2.allowed).toBe(true);
  });

  it('peek does not consume', async () => {
    const limiter = new SlidingWindow({ limit: 5, window: 10000 }, store);

    await limiter.consume('user1');
    const peek = await limiter.peek('user1');
    expect(peek.remaining).toBe(4);

    const peek2 = await limiter.peek('user1');
    expect(peek2.remaining).toBe(4);
  });

  it('reset clears both windows', async () => {
    const limiter = new SlidingWindow({ limit: 2, window: 10000 }, store);

    await limiter.consume('user1');
    await limiter.consume('user1');
    await limiter.reset('user1');

    const result = await limiter.consume('user1');
    expect(result.allowed).toBe(true);
  });
});

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
