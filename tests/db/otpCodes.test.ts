import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { deleteOtpCode, getOtpCode, incrementOtpAttempts, upsertOtpCode } from '../../src/db/otpCodes';

describe('otp_codes table', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('returns undefined before a code is requested', () => {
    expect(getOtpCode(db, 'person@example.com')).toBeUndefined();
  });

  it('stores and retrieves a code', () => {
    upsertOtpCode(db, 'person@example.com', 'hash1', '2099-01-01T00:00:00.000Z');
    const row = getOtpCode(db, 'person@example.com');
    expect(row?.codeHash).toBe('hash1');
    expect(row?.attempts).toBe(0);
  });

  it('replaces the previous code and resets attempts on a new request', () => {
    upsertOtpCode(db, 'person@example.com', 'hash1', '2099-01-01T00:00:00.000Z');
    incrementOtpAttempts(db, 'person@example.com');
    incrementOtpAttempts(db, 'person@example.com');
    upsertOtpCode(db, 'person@example.com', 'hash2', '2099-01-01T00:00:00.000Z');

    const row = getOtpCode(db, 'person@example.com');
    expect(row?.codeHash).toBe('hash2');
    expect(row?.attempts).toBe(0);
  });

  it('counts failed attempts', () => {
    upsertOtpCode(db, 'person@example.com', 'hash1', '2099-01-01T00:00:00.000Z');
    incrementOtpAttempts(db, 'person@example.com');
    expect(getOtpCode(db, 'person@example.com')?.attempts).toBe(1);
  });

  it('deletes a code once consumed', () => {
    upsertOtpCode(db, 'person@example.com', 'hash1', '2099-01-01T00:00:00.000Z');
    deleteOtpCode(db, 'person@example.com');
    expect(getOtpCode(db, 'person@example.com')).toBeUndefined();
  });
});
