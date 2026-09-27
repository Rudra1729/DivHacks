/**A per-key async lock, used to process one submission per user at a time.

better-sqlite3 is synchronous, but the surrounding request handler is not,
so two submissions from the same user could still interleave between the
Sentinel check and marking a claim pending. This lock serializes work by
key (the user's wallet address) without blocking unrelated users.
*/

const queues = new Map<string, Promise<void>>();

/** Run a function exclusively for a given key, queued behind any in-flight
call for the same key.

Args:
    key (string): The lock key, e.g. a user's wallet address.
    fn (() => Promise<T>): The function to run while holding the lock.

Returns:
    Promise<T>: The result of fn.
*/
export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = queues.get(key) ?? Promise.resolve();

  let release: () => void;
  const next = new Promise<void>((resolve) => {
    release = resolve;
  });
  queues.set(key, previous.then(() => next));

  await previous;
  try {
    return await fn();
  } finally {
    release!();
    if (queues.get(key) === next) {
      queues.delete(key);
    }
  }
}
