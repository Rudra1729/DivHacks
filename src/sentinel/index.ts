/**Sentinel: runs every verification check and reports all failures together.

Per the PRD, any failure stops a submission with status BLOCKED_SENTINEL,
and every check runs regardless so all failures are reported at once.
*/

import Database from 'better-sqlite3';
import { Place } from '../data/places';
import { CheckResult, checkLocation } from './location';
import { checkFreshness } from './freshness';
import { checkReplay } from './replay';

export const BLOCKED_SENTINEL = 'BLOCKED_SENTINEL';

export interface SentinelInput {
  place: Place;
  latitude: number;
  longitude: number;
  timestamp: string;
  photoBuffer: Buffer;
}

export interface SentinelResult {
  passed: boolean;
  status: 'OK' | typeof BLOCKED_SENTINEL;
  checks: CheckResult[];
  photoHash: string;
}

/** Run the location, freshness, and replay checks for a submission.

Args:
    db (Database.Database): Open database handle, for the replay check.
    input (SentinelInput): The submission fields Sentinel needs.

Returns:
    SentinelResult: Every check's result, an overall pass/fail, and the
    computed photo hash (the caller records it once the decision ID exists).
*/
export function runSentinelChecks(db: Database.Database, input: SentinelInput): SentinelResult {
  const locationResult = checkLocation(input.place, input.latitude, input.longitude);
  const freshnessResult = checkFreshness(input.timestamp);
  const replayResult = checkReplay(db, input.photoBuffer);

  const checks = [locationResult, freshnessResult, replayResult];
  const passed = checks.every((check) => check.passed);

  return {
    passed,
    status: passed ? 'OK' : BLOCKED_SENTINEL,
    checks,
    photoHash: replayResult.hash,
  };
}
