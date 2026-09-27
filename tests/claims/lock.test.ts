import { withLock } from '../../src/claims/lock';

describe('withLock', () => {
  it('serializes calls for the same key', async () => {
    const order: number[] = [];

    async function task(id: number, delayMs: number) {
      return withLock('user-1', async () => {
        order.push(id);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        order.push(-id);
      });
    }

    await Promise.all([task(1, 20), task(2, 0)]);

    // Task 1 must fully finish (1, -1) before task 2 starts (2, -2),
    // even though task 2's own work is instant.
    expect(order).toEqual([1, -1, 2, -2]);
  });

  it('does not serialize calls for different keys', async () => {
    const order: number[] = [];

    async function task(key: string, id: number, delayMs: number) {
      return withLock(key, async () => {
        order.push(id);
        await new Promise((resolve) => setTimeout(resolve, delayMs));
        order.push(-id);
      });
    }

    await Promise.all([task('user-1', 1, 20), task('user-2', 2, 0)]);

    // Different keys run concurrently, so task 2 finishes before task 1.
    expect(order.indexOf(-2)).toBeLessThan(order.indexOf(-1));
  });
});
