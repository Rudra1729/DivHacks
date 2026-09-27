/**Clear every visit from the database, for starting a new season.

Used together with fresh Solana collections: stamp numbering and the
once-per-place check both count stamps in the current collections, so new
collections plus an empty visit history restart every place at #1 for
everyone. Accounts, their wallets, and login codes are kept.
*/

import Database from 'better-sqlite3';

/** Tables holding visit history, children before the decisions they point to. */
const VISIT_TABLES = [
  'audit_events',
  'photo_fingerprints',
  'stamp_retries',
  'claims',
  'location_history',
  'request_ids',
  'decisions',
] as const;

/** Rows deleted per table. */
export type ClearedVisits = Record<(typeof VISIT_TABLES)[number], number>;

/** Delete every visit and everything recorded about it, in one transaction.

Args:
    db (Database.Database): Open database handle.

Returns:
    ClearedVisits: How many rows were deleted from each table.
*/
export function clearAllVisits(db: Database.Database): ClearedVisits {
  return db.transaction(() => {
    const cleared = {} as ClearedVisits;
    for (const table of VISIT_TABLES) {
      cleared[table] = db.prepare(`DELETE FROM ${table}`).run().changes;
    }
    return cleared;
  })();
}
