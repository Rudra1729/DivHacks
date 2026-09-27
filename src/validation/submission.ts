/**Validation for incoming mission submissions.

Reports every problem with a submission at once, per the PRD's
"Run every check and report all failures together" instruction for
Sentinel, applied here at the intake layer too.
*/

import { getPlaceById } from '../data/places';
import { parseLocationTrail } from './locationTrail';

const XRPL_ADDRESS_PATTERN = /^r[1-9A-HJ-NP-Za-km-z]{24,34}$/;
const SOLANA_ADDRESS_PATTERN = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;

export interface SubmissionInput {
  placeId?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  timestamp?: unknown;
  xrplAddress?: unknown;
  solanaAddress?: unknown;
  caption?: unknown;
  locationTrail?: unknown;
}

export interface SubmissionFile {
  mimetype: string;
  size: number;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic'];

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** Validate a mission submission's required fields, addresses, and photo.

Args:
    input (SubmissionInput): The submission's non-file fields.
    file (SubmissionFile | undefined): The uploaded photo, if any.

Returns:
    ValidationResult: valid=true with no errors, or valid=false with every
    problem found, so the caller can report them all at once.
*/
export function validateSubmission(
  input: SubmissionInput,
  file: SubmissionFile | undefined
): ValidationResult {
  const errors: string[] = [];

  if (!isNonEmptyString(input.placeId)) {
    errors.push('place is required');
  } else if (!getPlaceById(input.placeId)) {
    errors.push(`place is not on the allowlist: ${input.placeId}`);
  }

  if (toFiniteNumber(input.latitude) === undefined || toFiniteNumber(input.longitude) === undefined) {
    errors.push('location (latitude and longitude) is required');
  }

  if (!isNonEmptyString(input.timestamp) || Number.isNaN(Date.parse(input.timestamp))) {
    errors.push('timestamp is required and must be a valid date');
  }

  const trail = parseLocationTrail(input.locationTrail);
  if (!trail.ok) {
    errors.push(trail.error);
  }

  if (!isNonEmptyString(input.xrplAddress)) {
    errors.push('XRPL address is required');
  } else if (!XRPL_ADDRESS_PATTERN.test(input.xrplAddress)) {
    errors.push('XRPL address is malformed');
  }

  if (!isNonEmptyString(input.solanaAddress)) {
    errors.push('Solana address is required');
  } else if (!SOLANA_ADDRESS_PATTERN.test(input.solanaAddress)) {
    errors.push('Solana address is malformed');
  }

  if (!file) {
    errors.push('photo is required');
  } else {
    if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.mimetype)) {
      errors.push(`photo must be an image, got ${file.mimetype}`);
    }
    if (file.size > MAX_IMAGE_BYTES) {
      errors.push(`photo must be at most ${MAX_IMAGE_BYTES} bytes, got ${file.size}`);
    }
  }

  return { valid: errors.length === 0, errors };
}
