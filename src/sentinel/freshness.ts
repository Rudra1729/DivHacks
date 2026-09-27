/**Sentinel freshness check: was the photo taken recently and not in the future?*/

import { CheckResult } from './location';

const MAX_AGE_MS = 15 * 60 * 1000;

/** Check whether a submitted timestamp is fresh.

Args:
    timestamp (string | number): The submitted photo timestamp, as an ISO
        8601 string or epoch milliseconds.
    now (Date): The current time. Injectable for tests.

Returns:
    CheckResult: Whether the check passed, and a human-readable reason.
*/
export function checkFreshness(timestamp: string | number, now: Date = new Date()): CheckResult {
  const submitted = new Date(timestamp);
  const ageMs = now.getTime() - submitted.getTime();

  if (ageMs < 0) {
    return { passed: false, message: 'freshness: photo timestamp is in the future' };
  }

  if (ageMs > MAX_AGE_MS) {
    return {
      passed: false,
      message: `freshness: photo is ${Math.round(ageMs / 60000)} minutes old, max is 15 minutes`,
    };
  }

  return { passed: true, message: 'freshness: photo is recent' };
}
