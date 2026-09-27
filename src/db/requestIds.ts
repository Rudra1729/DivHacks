/**Data access for the request_ids table.

Used to avoid double-handling a submission that gets retried or resent by
a client, e.g. after a network timeout.
*/

import Database from 'better-sqlite3';

/** Check whether a request ID has already been processed.

Args:
    db (Database.Database): Open database handle.
    requestId (string): Client-supplied idempotency key.

Returns:
    boolean: True if this request has been seen before.
*/
export function isRequestSeen(db: Database.Database, requestId: string): boolean {
  const row = db.prepare('SELECT 1 FROM request_ids WHERE request_id = ?').get(requestId);
  return row !== undefined;
}

/** Record a request ID as processed.

Args:
    db (Database.Database): Open database handle.
    requestId (string): Client-supplied idempotency key.
*/
export function recordRequestId(db: Database.Database, requestId: string): void {
  db.prepare('INSERT INTO request_ids (request_id) VALUES (?)').run(requestId);
}
