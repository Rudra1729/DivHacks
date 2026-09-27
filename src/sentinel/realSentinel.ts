/**Real Sentinel: location, freshness, replay, and once-per-place checks.

Implements the Sentinel interface the orchestrator depends on (src/sentinel/
types.ts), replacing FakeSentinel. Every check runs regardless of earlier
failures, and every failure is reported together, per the PRD.
*/

import Database from 'better-sqlite3';
import { Place, SubmissionInput } from '../orchestrator/types';
import { Sentinel, SentinelResult } from './types';
import { haversineDistanceMeters } from './location';
import { checkFreshness } from './freshness';
import { checkReplay } from './replay';
import { findActiveClaim } from '../db/claims';
import { recordPhotoHash } from '../db/photoFingerprints';
import { StampService } from '../solana/types';

export class RealSentinel implements Sentinel {
  /** Create the real Sentinel.

  Args:
      db (Database.Database): Open database handle, for replay and
          once-per-place checks.
      stamps (Pick<StampService, 'hasStampForPlace'>): Optional. When given,
          Solana is asked whether the wallet already holds a stamp for the
          place, so a repeat claim is blocked even if this server's database
          is empty, as when it is restarted or replaced.
  */
  constructor(
    private db: Database.Database,
    private stamps?: Pick<StampService, 'hasStampForPlace'>
  ) {}

  async verify(input: SubmissionInput, place: Place): Promise<SentinelResult> {
    const failures: string[] = [];

    const distance = haversineDistanceMeters(
      place.latitude,
      place.longitude,
      input.latitude,
      input.longitude
    );
    if (distance > place.radiusMeters) {
      failures.push(
        `location: ${Math.round(distance)}m from ${place.name}, max is ${place.radiusMeters}m`
      );
    }

    const freshness = checkFreshness(input.timestamp);
    if (!freshness.passed) {
      failures.push(freshness.message);
    }

    const replay = checkReplay(this.db, input.photo);
    if (!replay.passed) {
      failures.push(replay.message);
    }

    const activeClaim = findActiveClaim(this.db, input.placeId, input.xrplAddress, input.solanaAddress);
    if (activeClaim) {
      failures.push(`once per place: a ${activeClaim.status} claim already exists for this place`);
    }

    // Only ask Solana when the local database has not already blocked the claim,
    // so a repeat claim is reported once, without a network call.
    if (this.stamps && !activeClaim) {
      const stampFailure = await this.checkStampOnSolana(input);
      if (stampFailure) {
        failures.push(stampFailure);
      }
    }

    if (failures.length > 0) {
      return { ok: false, failures };
    }

    // Record the photo as seen now that the whole submission has cleared
    // every other check, so a rejected submission's photo can be retried.
    recordPhotoHash(this.db, replay.hash);
    return { ok: true };
  }

  /** Ask Solana whether this wallet already holds a stamp for the place.

  Stamp ownership on Solana is the source of truth for the once-per-place rule.
  If Solana cannot be read, the claim is blocked for now rather than risking a
  second payment for a place the wallet may already have.

  Args:
      input (SubmissionInput): The submission being checked.

  Returns:
      Promise<string | undefined>: A failure message, or undefined if the wallet
          has no stamp for the place.
  */
  private async checkStampOnSolana(input: SubmissionInput): Promise<string | undefined> {
    try {
      if (await this.stamps!.hasStampForPlace(input.solanaAddress, input.placeId)) {
        return 'once per place: this Solana wallet already holds a stamp for this place';
      }
      return undefined;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      return `once per place: could not check this wallet's stamps on Solana, try again shortly (${reason})`;
    }
  }
}
