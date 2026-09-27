/**Data access for the claims table.

A claim is marked pending before any payment is attempted, and is used by
the once-per-place rule: a user with a pending or paid claim for a place,
matched on either wallet address, is blocked from claiming it again.
*/

import Database from 'better-sqlite3';

export type ClaimStatus = 'pending' | 'paid' | 'failed';

export interface Claim {
  id: number;
  xrplAddress: string;
  solanaAddress: string;
  placeId: string;
  status: ClaimStatus;
  createdAt: string;
  updatedAt: string;
}

interface ClaimRow {
  id: number;
  xrpl_address: string;
  solana_address: string;
  place_id: string;
  status: ClaimStatus;
  created_at: string;
  updated_at: string;
}

function fromRow(row: ClaimRow): Claim {
  return {
    id: row.id,
    xrplAddress: row.xrpl_address,
    solanaAddress: row.solana_address,
    placeId: row.place_id,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Find an existing pending or paid claim for a place, on either wallet.

Args:
    db (Database.Database): Open database handle.
    placeId (string): The place being claimed.
    xrplAddress (string): The submitting user's XRPL address.
    solanaAddress (string): The submitting user's Solana address.

Returns:
    Claim | undefined: The blocking claim, if one exists.
*/
export function findActiveClaim(
  db: Database.Database,
  placeId: string,
  xrplAddress: string,
  solanaAddress: string
): Claim | undefined {
  const row = db
    .prepare(
      `SELECT * FROM claims
       WHERE place_id = @placeId
         AND status IN ('pending', 'paid')
         AND (xrpl_address = @xrplAddress OR solana_address = @solanaAddress)
       LIMIT 1`
    )
    .get({ placeId, xrplAddress, solanaAddress }) as ClaimRow | undefined;
  return row ? fromRow(row) : undefined;
}

/** Create a new claim in pending status, before any payment is attempted.

Args:
    db (Database.Database): Open database handle.
    placeId (string): The place being claimed.
    xrplAddress (string): The submitting user's XRPL address.
    solanaAddress (string): The submitting user's Solana address.

Returns:
    Claim: The created claim.
*/
export function createPendingClaim(
  db: Database.Database,
  placeId: string,
  xrplAddress: string,
  solanaAddress: string
): Claim {
  const result = db
    .prepare(
      'INSERT INTO claims (xrpl_address, solana_address, place_id, status) VALUES (@xrplAddress, @solanaAddress, @placeId, \'pending\')'
    )
    .run({ xrplAddress, solanaAddress, placeId });
  return getClaim(db, Number(result.lastInsertRowid)) as Claim;
}

/** Fetch a claim by ID.

Args:
    db (Database.Database): Open database handle.
    id (number): The claim's row ID.

Returns:
    Claim | undefined: The claim, or undefined if not found.
*/
export function getClaim(db: Database.Database, id: number): Claim | undefined {
  const row = db.prepare('SELECT * FROM claims WHERE id = ?').get(id) as ClaimRow | undefined;
  return row ? fromRow(row) : undefined;
}

/** Update a claim's status.

Args:
    db (Database.Database): Open database handle.
    id (number): The claim's row ID.
    status (ClaimStatus): The new status.
*/
export function updateClaimStatus(db: Database.Database, id: number, status: ClaimStatus): void {
  db.prepare(
    "UPDATE claims SET status = @status, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = @id"
  ).run({ id, status });
}
