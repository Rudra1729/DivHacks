/**Real Sentinel: location, plausibility, freshness, replay, and once-per-place checks.

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
import {
  PLAUSIBILITY_LIMITS,
  checkAccuracy,
  checkCluster,
  checkFrozenTrail,
  checkImpossibleTravel,
  checkTrail,
  checkTypedCoordinates,
} from './plausibility';
import { findActiveClaim } from '../db/claims';
import { countOtherWalletsAtPoint, getLatestLocation, recordLocation } from '../db/locationHistory';
import { recordPhotoHash } from '../db/photoFingerprints';
import { StampService } from '../solana/types';

/** Options for the real Sentinel.

Attributes:
    locationChecks (boolean): Run the location plausibility checks. Defaults to true.
    now (() => number): Server clock in epoch ms. Defaults to Date.now.
*/
export interface RealSentinelOptions {
  locationChecks?: boolean;
  now?: () => number;
}

export class RealSentinel implements Sentinel {
  private locationChecks: boolean;
  private now: () => number;

  /** Create the real Sentinel.

  Args:
      db (Database.Database): Open database handle, for replay,
          once-per-place, and location history checks.
      stamps (Pick<StampService, 'hasStampForPlace'>): Optional. When given,
          Solana is asked whether the wallet already holds a stamp for the
          place, so a repeat claim is blocked even if this server's database
          is empty, as when it is restarted or replaced.
      options (RealSentinelOptions): Location checks switch and clock.
  */
  constructor(
    private db: Database.Database,
    private stamps?: Pick<StampService, 'hasStampForPlace'>,
    options: RealSentinelOptions = {}
  ) {
    this.locationChecks = options.locationChecks ?? true;
    this.now = options.now ?? Date.now;
  }

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

    const now = this.now();
    if (this.locationChecks) {
      failures.push(...this.checkPlausibility(input, place, now));
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
    // Only passed submissions enter the location history, so nobody can
    // block another wallet by sending far-away submissions in its name.
    if (this.locationChecks) {
      recordLocation(this.db, {
        placeId: input.placeId,
        xrplAddress: input.xrplAddress,
        solanaAddress: input.solanaAddress,
        latitude: input.latitude,
        longitude: input.longitude,
        recordedAt: now,
      });
    }
    return { ok: true };
  }

  /** Run the checks that spot a faked location.

  Args:
      input (SubmissionInput): The submission being checked.
      place (Place): The place being claimed.
      now (number): Server time, epoch ms.

  Returns:
      string[]: Every plausibility failure, empty if the location looks real.
  */
  private checkPlausibility(input: SubmissionInput, place: Place, now: number): string[] {
    const submitted = { latitude: input.latitude, longitude: input.longitude };
    const trail = input.locationTrail ?? [];
    const previous = getLatestLocation(this.db, input.xrplAddress, input.solanaAddress);
    const otherWallets = countOtherWalletsAtPoint(
      this.db,
      input.latitude,
      input.longitude,
      now - PLAUSIBILITY_LIMITS.clusterWindowMs,
      input.xrplAddress,
      input.solanaAddress
    );
    return [
      ...checkTrail(input.locationTrail, submitted, now),
      ...checkFrozenTrail(trail),
      ...checkAccuracy(trail),
      ...checkTypedCoordinates(place, submitted, trail),
      ...checkImpossibleTravel(previous, submitted, now),
      ...checkCluster(otherWallets),
    ];
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
