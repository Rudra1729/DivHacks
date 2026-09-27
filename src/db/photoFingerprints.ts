/**Data access for the photo_fingerprints table.

Used by the Sentinel replay check: a SHA-256 hash of every submitted photo
is stored so a reused photo can be blocked.
*/

import Database from 'better-sqlite3';

/** Check whether a photo hash has already been recorded.

Args:
    db (Database.Database): Open database handle.
    hash (string): SHA-256 hex digest of the photo.

Returns:
    boolean: True if this photo has been seen before.
*/
export function isPhotoHashSeen(db: Database.Database, hash: string): boolean {
  const row = db.prepare('SELECT 1 FROM photo_fingerprints WHERE hash = ?').get(hash);
  return row !== undefined;
}

/** Record a new photo hash.

Args:
    db (Database.Database): Open database handle.
    hash (string): SHA-256 hex digest of the photo.
    decisionId (string | null): The decision this photo belongs to, if known yet.
*/
export function recordPhotoHash(
  db: Database.Database,
  hash: string,
  decisionId: string | null = null
): void {
  db.prepare(
    'INSERT INTO photo_fingerprints (hash, decision_id) VALUES (@hash, @decisionId)'
  ).run({ hash, decisionId });
}
