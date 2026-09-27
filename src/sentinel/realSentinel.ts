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

export class RealSentinel implements Sentinel {
  /** Create the real Sentinel.

  Args:
      db (Database.Database): Open database handle, for replay and
          once-per-place checks.
  */
  constructor(private db: Database.Database) {}

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

    if (failures.length > 0) {
      return { ok: false, failures };
    }

    // Record the photo as seen now that the whole submission has cleared
    // every other check, so a rejected submission's photo can be retried.
    recordPhotoHash(this.db, replay.hash);
    return { ok: true };
  }
}
