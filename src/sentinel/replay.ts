/**Sentinel replay check: has this exact photo been submitted before?*/

import { createHash } from 'crypto';
import Database from 'better-sqlite3';
import { isPhotoHashSeen } from '../db/photoFingerprints';
import { CheckResult } from './location';

/** Compute the SHA-256 hex digest of a photo buffer.

Args:
    photoBuffer (Buffer): The uploaded photo's raw bytes.

Returns:
    string: The SHA-256 hex digest.
*/
export function hashPhoto(photoBuffer: Buffer): string {
  return createHash('sha256').update(photoBuffer).digest('hex');
}

/** Check whether a photo has already been submitted.

Args:
    db (Database.Database): Open database handle.
    photoBuffer (Buffer): The uploaded photo's raw bytes.

Returns:
    CheckResult & { hash: string }: Whether the check passed, a reason, and
    the computed hash so the caller can record it once the decision is known.
*/
export function checkReplay(
  db: Database.Database,
  photoBuffer: Buffer
): CheckResult & { hash: string } {
  const hash = hashPhoto(photoBuffer);

  if (isPhotoHashSeen(db, hash)) {
    return { passed: false, message: 'replay: this photo has already been submitted', hash };
  }

  return { passed: true, message: 'replay: photo not seen before', hash };
}
