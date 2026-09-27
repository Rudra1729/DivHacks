/**Data access for the location_history table.

Sentinel records where a wallet was each time a submission passes, then uses
that history to spot impossible travel (one wallet jumping across town in
seconds) and clusters (many wallets sending the exact same coordinates).
Times are server times in epoch milliseconds, never the client's clock.
*/

import Database from 'better-sqlite3';

/** Decimal places kept when comparing points. Six decimals is about 11 cm. */
const POINT_KEY_DECIMALS = 6;

/** A recorded location for one passed submission.

Attributes:
    placeId (string): Place the submission was for.
    xrplAddress (string): Submitting XRPL wallet.
    solanaAddress (string): Submitting Solana wallet.
    latitude (number): Submitted latitude.
    longitude (number): Submitted longitude.
    recordedAt (number): Server time it was recorded, epoch milliseconds.
*/
export interface LocationRecord {
  placeId: string;
  xrplAddress: string;
  solanaAddress: string;
  latitude: number;
  longitude: number;
  recordedAt: number;
}

interface LocationRow {
  place_id: string;
  xrpl_address: string;
  solana_address: string;
  latitude: number;
  longitude: number;
  recorded_at: number;
}

function fromRow(row: LocationRow): LocationRecord {
  return {
    placeId: row.place_id,
    xrplAddress: row.xrpl_address,
    solanaAddress: row.solana_address,
    latitude: row.latitude,
    longitude: row.longitude,
    recordedAt: row.recorded_at,
  };
}

/** Key two points share when they are the same to about 11 cm.

Args:
    latitude (number): Latitude in degrees.
    longitude (number): Longitude in degrees.

Returns:
    string: The rounded "lat,lon" key.
*/
export function pointKey(latitude: number, longitude: number): string {
  return `${latitude.toFixed(POINT_KEY_DECIMALS)},${longitude.toFixed(POINT_KEY_DECIMALS)}`;
}

/** Record where a wallet was for a passed submission.

Args:
    db (Database.Database): Open database handle.
    record (LocationRecord): The location and when it was recorded.
*/
export function recordLocation(db: Database.Database, record: LocationRecord): void {
  db.prepare(
    `INSERT INTO location_history
       (place_id, xrpl_address, solana_address, latitude, longitude, point_key, recorded_at)
     VALUES (@placeId, @xrplAddress, @solanaAddress, @latitude, @longitude, @pointKey, @recordedAt)`
  ).run({ ...record, pointKey: pointKey(record.latitude, record.longitude) });
}

/** Most recent location recorded for either of a user's wallets.

Args:
    db (Database.Database): Open database handle.
    xrplAddress (string): The user's XRPL wallet.
    solanaAddress (string): The user's Solana wallet.

Returns:
    LocationRecord | undefined: The latest record, or undefined if none.
*/
export function getLatestLocation(
  db: Database.Database,
  xrplAddress: string,
  solanaAddress: string
): LocationRecord | undefined {
  const row = db
    .prepare(
      `SELECT * FROM location_history
       WHERE xrpl_address = @xrplAddress OR solana_address = @solanaAddress
       ORDER BY recorded_at DESC, id DESC
       LIMIT 1`
    )
    .get({ xrplAddress, solanaAddress }) as LocationRow | undefined;
  return row ? fromRow(row) : undefined;
}

/** Count other users who sent exactly the same point since a given time.

Args:
    db (Database.Database): Open database handle.
    latitude (number): The point's latitude.
    longitude (number): The point's longitude.
    since (number): Only count records at or after this server time, epoch ms.
    xrplAddress (string): The submitting user's XRPL wallet, excluded.
    solanaAddress (string): The submitting user's Solana wallet, excluded.

Returns:
    number: Distinct other XRPL wallets recorded at the same point.
*/
export function countOtherWalletsAtPoint(
  db: Database.Database,
  latitude: number,
  longitude: number,
  since: number,
  xrplAddress: string,
  solanaAddress: string
): number {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT xrpl_address) AS wallets FROM location_history
       WHERE point_key = @pointKey
         AND recorded_at >= @since
         AND xrpl_address != @xrplAddress
         AND solana_address != @solanaAddress`
    )
    .get({ pointKey: pointKey(latitude, longitude), since, xrplAddress, solanaAddress }) as { wallets: number };
  return row.wallets;
}
