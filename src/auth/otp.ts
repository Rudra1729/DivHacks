/**One-time login codes for email auth.

Codes are 6 digits, short-lived, and stored only as a salted hash: a
database read never reveals a usable code. Comparison is constant-time to
avoid leaking the code one character at a time via response timing.
*/

import { randomInt, timingSafeEqual, createHash } from 'crypto';

export const OTP_LENGTH = 6;
export const OTP_TTL_MS = 10 * 60 * 1000;
export const MAX_OTP_ATTEMPTS = 5;

/** Generate a random 6-digit code, zero-padded.

Returns:
    string: A code such as '042817'.
*/
export function generateOtp(): string {
  return randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, '0');
}

/** Hash a code for storage.

Args:
    code (string): The plaintext code.

Returns:
    string: A hex-encoded SHA-256 hash.
*/
export function hashOtp(code: string): string {
  return createHash('sha256').update(code).digest('hex');
}

/** Compare a submitted code against its stored hash without leaking timing.

Args:
    code (string): The code the user submitted.
    storedHash (string): The hash saved when the code was issued.

Returns:
    boolean: True if the code matches.
*/
export function otpMatches(code: string, storedHash: string): boolean {
  const submittedHash = Buffer.from(hashOtp(code), 'hex');
  const stored = Buffer.from(storedHash, 'hex');
  if (submittedHash.length !== stored.length) {
    return false;
  }
  return timingSafeEqual(submittedHash, stored);
}
