import { SerialQueue } from '../../src/xrpl/queue';

describe('SerialQueue', () => {
  it('runs tasks one at a time in call order', async () => {
    const queue = new SerialQueue();
    const events: string[] = [];
    const task = (name: string, ms: number) => async () => {
      events.push(`start ${name}`);
      await new Promise((resolve) => setTimeout(resolve, ms));
      events.push(`end ${name}`);
      return name;
    };

    const results = await Promise.all([queue.run(task('a', 30)), queue.run(task('b', 1)), queue.run(task('c', 1))]);

    expect(results).toEqual(['a', 'b', 'c']);
    expect(events).toEqual(['start a', 'end a', 'start b', 'end b', 'start c', 'end c']);
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
