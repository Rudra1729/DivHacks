/**A queue that runs async tasks one at a time, in call order.

Every XRPL transaction from a wallet carries the next sequence number.
Two payments signed at the same instant would get the same number and one
would fail, so all agent payments go through a single queue.
*/

/** Runs tasks strictly one after another.

Attributes:
    tail (Promise<unknown>): Settles when the last queued task finishes.
*/
export class SerialQueue {
  private tail: Promise<unknown> = Promise.resolve();

  /** Queue a task and wait for its result.

  A failing task does not block the tasks queued after it.

  Args:
      task (() => Promise<T>): Work to run once earlier tasks finish.

  Returns:
      Promise<T>: The task's result.
  */
  run<T>(task: () => Promise<T>): Promise<T> {
    const result = this.tail.then(task, task);
    this.tail = result.catch(() => undefined);
    return result;
  }
}
