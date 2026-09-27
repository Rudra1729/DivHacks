/**One-at-a-time queue and single-retry helper for Solana calls.

Mints go through one shared queue so the issuer never sends two mint
transactions at once. Every network call gets exactly one retry, matching
the PRD rule "one retry per network call".
*/

/** Runs async tasks strictly one after another, in the order they arrive.

A failed task does not block the tasks queued behind it.
*/
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  /** Add a task to the end of the queue.

  Args:
      task (() => Promise<T>): Work to run once every earlier task has settled.

  Returns:
      Promise<T>: Settles with the task's own result or error.
  */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}

/** Run a task, and run it once more if the first attempt throws.

Args:
    task ((attempt: number) => Promise<T>): Work to run. Receives 1 on the
        first attempt and 2 on the retry.

Returns:
    Promise<T>: The result of the first successful attempt.

Raises:
    Error: The second attempt's error if both attempts fail.
*/
export async function withOneRetry<T>(task: (attempt: number) => Promise<T>): Promise<T> {
  try {
    return await task(1);
  } catch {
    return task(2);
  }
}

/** Shared queue for every mint sent by the issuer wallet. */
export const mintQueue = new SerialQueue();
