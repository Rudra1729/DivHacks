/**Parsing for the GPS trail sent with a submission.

The app samples the phone's location every couple of seconds while the camera
is open and sends the readings as a JSON array in the locationTrail field.
This module only checks the shape. Whether the trail looks like a real phone
is Sentinel's job (src/sentinel/plausibility.ts).
*/

import { LocationSample } from '../orchestrator/types';

/** Most readings accepted in one trail, to bound the work per request. */
export const MAX_TRAIL_SAMPLES = 120;

/** Outcome of parsing a trail field. */
export type ParsedTrail =
  | { ok: true; trail: LocationSample[] | undefined }
  | { ok: false; error: string };

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

/** Check one reading's fields and ranges.

Args:
    value (unknown): One element of the parsed array.

Returns:
    boolean: True if it is a usable reading.
*/
function isSample(value: unknown): value is LocationSample {
  if (typeof value !== 'object' || value === null) {
    return false;
  }
  const sample = value as Record<string, unknown>;
  return (
    isFiniteNumber(sample.latitude) &&
    Math.abs(sample.latitude) <= 90 &&
    isFiniteNumber(sample.longitude) &&
    Math.abs(sample.longitude) <= 180 &&
    isFiniteNumber(sample.accuracy) &&
    sample.accuracy >= 0 &&
    isFiniteNumber(sample.timestamp)
  );
}

/** Parse the locationTrail field of a submission.

Args:
    value (unknown): The raw field, a JSON string from a multipart form or an
        array from a JSON body. Missing or empty means no trail was sent.

Returns:
    ParsedTrail: The readings (undefined if none were sent), or an error.
*/
export function parseLocationTrail(value: unknown): ParsedTrail {
  if (value === undefined || value === null || value === '') {
    return { ok: true, trail: undefined };
  }

  let parsed: unknown = value;
  if (typeof value === 'string') {
    try {
      parsed = JSON.parse(value);
    } catch {
      return { ok: false, error: 'location trail must be a JSON array of GPS readings' };
    }
  }

  if (!Array.isArray(parsed)) {
    return { ok: false, error: 'location trail must be a JSON array of GPS readings' };
  }
  if (parsed.length > MAX_TRAIL_SAMPLES) {
    return { ok: false, error: `location trail has ${parsed.length} readings, max is ${MAX_TRAIL_SAMPLES}` };
  }
  if (!parsed.every(isSample)) {
    return {
      ok: false,
      error: 'location trail readings need numeric latitude, longitude, accuracy (m), and timestamp (ms)',
    };
  }
  return {
    ok: true,
    trail: parsed.map(({ latitude, longitude, accuracy, timestamp }) => ({ latitude, longitude, accuracy, timestamp })),
  };
}
