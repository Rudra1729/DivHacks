/**Once-per-place rule: has this user already claimed this place?*/

import Database from 'better-sqlite3';
import { findActiveClaim, createPendingClaim, Claim } from '../db/claims';

export interface OncePerPlaceResult {
  passed: boolean;
  message: string;
}

/** Check whether the user already holds a pending or paid claim for a place.

Args:
    db (Database.Database): Open database handle.
    placeId (string): The place being claimed.
    xrplAddress (string): The submitting user's XRPL address.
    solanaAddress (string): The submitting user's Solana address.

Returns:
    OncePerPlaceResult: Whether the check passed, and a human-readable reason.
*/
export function checkOncePerPlace(
  db: Database.Database,
  placeId: string,
  xrplAddress: string,
  solanaAddress: string
): OncePerPlaceResult {
  const existing = findActiveClaim(db, placeId, xrplAddress, solanaAddress);

  if (existing) {
    return {
      passed: false,
      message: `once per place: a ${existing.status} claim already exists for this place`,
    };
  }

  return { passed: true, message: 'once per place: no existing claim' };
}

/** Mark a claim pending, before any payment is attempted.

Args:
    db (Database.Database): Open database handle.
    placeId (string): The place being claimed.
    xrplAddress (string): The submitting user's XRPL address.
    solanaAddress (string): The submitting user's Solana address.

Returns:
    Claim: The created pending claim.
*/
export function markClaimPending(
  db: Database.Database,
  placeId: string,
  xrplAddress: string,
  solanaAddress: string
): Claim {
  return createPendingClaim(db, placeId, xrplAddress, solanaAddress);
}
