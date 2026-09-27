import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { createUser, getUserByEmail, getUserById } from '../../src/db/users';

const WALLETS = {
  xrplAddress: 'rXRPLADDRESS',
  xrplSecretEncrypted: 'iv:tag:cipher',
  solanaAddress: 'SoLANAaddress',
  solanaSecretEncrypted: 'iv:tag:cipher2',
};

describe('users table', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('returns undefined for an email with no account', () => {
    expect(getUserByEmail(db, 'nobody@example.com')).toBeUndefined();
  });

  it('creates a user with both wallet addresses and encrypted secrets', () => {
    const user = createUser(db, 'person@example.com', WALLETS);
    expect(user.email).toBe('person@example.com');
    expect(user.xrplAddress).toBe(WALLETS.xrplAddress);
    expect(user.solanaAddress).toBe(WALLETS.solanaAddress);
    expect(user.id).toBeTruthy();
  });

  it('finds a created user by email and by ID', () => {
    const created = createUser(db, 'person@example.com', WALLETS);
    expect(getUserByEmail(db, 'person@example.com')).toEqual(created);
    expect(getUserById(db, created.id)).toEqual(created);
  });

  it('enforces one account per email', () => {
    createUser(db, 'person@example.com', WALLETS);
    expect(() => createUser(db, 'person@example.com', WALLETS)).toThrow();
  });
});
