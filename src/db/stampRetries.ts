/**Data access for the stamp_retries table.

Records decisions whose Solana mint failed after a successful payment, so
the mint can be retried without ever repeating the payment.
*/

import Database from 'better-sqlite3';

export interface StampRetry {
  decisionId: string;
  placeId: string | null;
  solanaAddress: string | null;
  xrplTxHash: string | null;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  updatedAt: string;
}

interface StampRetryRow {
  decision_id: string;
  place_id: string | null;
  solana_address: string | null;
  xrpl_tx_hash: string | null;
  attempts: number;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

function fromRow(row: StampRetryRow): StampRetry {
  return {
    decisionId: row.decision_id,
    placeId: row.place_id,
    solanaAddress: row.solana_address,
    xrplTxHash: row.xrpl_tx_hash,
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

/** Queue a full mint input for retry, so the retry can actually re-attempt
the mint later without needing to look anything else up.

Args:
    db (Database.Database): Open database handle.
    input (object): The failed mint's decisionId, placeId, userSolanaAddress, xrplTxHash.
    error (string): The error message from the failed mint attempt.
*/
export function queueStampRetryWithInput(
  db: Database.Database,
  input: { decisionId: string; placeId: string; userSolanaAddress: string; xrplTxHash: string },
  error: string
): void {
  db.prepare(
    `INSERT INTO stamp_retries (decision_id, place_id, solana_address, xrpl_tx_hash, attempts, last_error)
     VALUES (@decisionId, @placeId, @solanaAddress, @xrplTxHash, 1, @error)
     ON CONFLICT(decision_id) DO UPDATE SET
       place_id = excluded.place_id,
       solana_address = excluded.solana_address,
       xrpl_tx_hash = excluded.xrpl_tx_hash,
       attempts = attempts + 1,
       last_error = excluded.last_error,
       updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).run({
    decisionId: input.decisionId,
    placeId: input.placeId,
    solanaAddress: input.userSolanaAddress,
    xrplTxHash: input.xrplTxHash,
    error,
  });
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
