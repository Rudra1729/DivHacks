/**Data access for the stamp_retries table.

Records decisions whose Solana mint failed after a successful payment, so
the mint can be retried without ever repeating the payment.
*/

import Database from 'better-sqlite3';

export interface StampRetry {
  decisionId: string;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StampRetryRow {
  decision_id: string;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: StampRetryRow): StampRetry {
  return {
    decisionId: row.decision_id,
    attempts: row.attempts,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Queue a decision for a stamp mint retry, or bump its attempt count.

Args:
    db (Database.Database): Open database handle.
    decisionId (string): The decision whose mint failed.
    error (string): The error message from the failed mint attempt.
*/
export function queueStampRetry(db: Database.Database, decisionId: string, error: string): void {
  db.prepare(
    `INSERT INTO stamp_retries (decision_id, attempts, last_error)
     VALUES (@decisionId, 1, @error)
     ON CONFLICT(decision_id) DO UPDATE SET
       attempts = attempts + 1,
       last_error = @error,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).run({ decisionId, error });
}

/** List all decisions currently queued for a stamp retry.

Args:
    db (Database.Database): Open database handle.

Returns:
    StampRetry[]: The queued retries.
*/
export function listStampRetries(db: Database.Database): StampRetry[] {
  const rows = db.prepare('SELECT * FROM stamp_retries').all() as StampRetryRow[];
  return rows.map(fromRow);
}

/** Remove a decision from the retry queue once its mint succeeds.

Args:
    db (Database.Database): Open database handle.
    decisionId (string): The decision to clear.
*/
export function clearStampRetry(db: Database.Database, decisionId: string): void {
  db.prepare('DELETE FROM stamp_retries WHERE decision_id = ?').run(decisionId);
}
