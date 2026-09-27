/**Tests for the one-at-a-time mint queue and the single-retry helper.*/

import { SerialQueue, withOneRetry } from '../../src/solana/mintQueue';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('SerialQueue', () => {
  it('never runs two tasks at the same time', async () => {
    const queue = new SerialQueue();
    let running = 0;
    let maxRunning = 0;
    const task = async () => {
      running += 1;
      maxRunning = Math.max(maxRunning, running);
      await sleep(5);
      running -= 1;
    };

    await Promise.all([queue.run(task), queue.run(task), queue.run(task)]);
    expect(maxRunning).toBe(1);
  });

  it('keeps going after a task fails', async () => {
    const queue = new SerialQueue();
    const failed = queue.run(async () => {
      throw new Error('boom');
    });
    const next = queue.run(async () => 'ok');

    await expect(failed).rejects.toThrow('boom');
    await expect(next).resolves.toBe('ok');
  });
});

describe('withOneRetry', () => {
  it('retries exactly once and returns the second result', async () => {
    const attempts: number[] = [];
    const result = await withOneRetry(async (attempt) => {
      attempts.push(attempt);
      if (attempt === 1) throw new Error('first try fails');
      return 'second try';
    });
    expect(result).toBe('second try');
    expect(attempts).toEqual([1, 2]);
  });

  it('gives up after the retry fails', async () => {
    let calls = 0;
    await expect(
      withOneRetry(async () => {
        calls += 1;
        throw new Error(`fail ${calls}`);
      })
    ).rejects.toThrow('fail 2');
    expect(calls).toBe(2);
  });
});
