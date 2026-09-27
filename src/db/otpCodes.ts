/**Data access for the otp_codes table.

One row per email: the latest requested code's hash, its expiry, and how
many wrong guesses have been made against it. A new request for the same
email replaces the row outright, invalidating the previous code.
*/

import Database from 'better-sqlite3';

export interface OtpCode {
  email: string;
  codeHash: string;
  expiresAt: string;
  attempts: number;
  createdAt: string;
}

interface OtpCodeRow {
  email: string;
  code_hash: string;
  expires_at: string;
  attempts: number;
  created_at: string;
}

function fromRow(row: OtpCodeRow): OtpCode {
  return {
    email: row.email,
    codeHash: row.code_hash,
    expiresAt: row.expires_at,
    attempts: row.attempts,
    createdAt: row.created_at,
  };
}

/** Store a freshly issued code, replacing any previous one for this email.

Args:
    db (Database.Database): Open database handle.
    email (string): The email the code was sent to.
    codeHash (string): SHA-256 hash of the code.
    expiresAt (string): ISO timestamp after which the code is invalid.
*/
export function upsertOtpCode(db: Database.Database, email: string, codeHash: string, expiresAt: string): void {
  db.prepare(
    `INSERT INTO otp_codes (email, code_hash, expires_at, attempts)
     VALUES (@email, @codeHash, @expiresAt, 0)
     ON CONFLICT(email) DO UPDATE SET code_hash = @codeHash, expires_at = @expiresAt, attempts = 0,
       created_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')`
  ).run({ email, codeHash, expiresAt });
}

/** Fetch the current OTP row for an email.

Args:
    db (Database.Database): Open database handle.
    email (string): The email to look up.

Returns:
    OtpCode | undefined: The row, or undefined if no code was ever requested
        (or it was already consumed).
*/
export function getOtpCode(db: Database.Database, email: string): OtpCode | undefined {
  const row = db.prepare('SELECT * FROM otp_codes WHERE email = ?').get(email) as OtpCodeRow | undefined;
  return row ? fromRow(row) : undefined;
}

/** Record a failed verification attempt.

Args:
    db (Database.Database): Open database handle.
    email (string): The email whose code was guessed wrong.
*/
export function incrementOtpAttempts(db: Database.Database, email: string): void {
  db.prepare('UPDATE otp_codes SET attempts = attempts + 1 WHERE email = ?').run(email);
}

/** Delete a code, once it has been used or should no longer be guessable.

Args:
    db (Database.Database): Open database handle.
    email (string): The email whose code should be invalidated.
*/
export function deleteOtpCode(db: Database.Database, email: string): void {
  db.prepare('DELETE FROM otp_codes WHERE email = ?').run(email);
}
