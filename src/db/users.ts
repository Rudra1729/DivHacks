/**Data access for the users table.

One row per email, holding the address and encrypted secret of that
user's custodial Solana wallet (NFTs) and XRPL wallet (RLUSD).
*/

import Database from 'better-sqlite3';
import { randomUUID } from 'crypto';

export interface User {
  id: string;
  email: string;
  xrplAddress: string;
  xrplSecretEncrypted: string;
  solanaAddress: string;
  solanaSecretEncrypted: string;
  createdAt: string;
}

interface UserRow {
  id: string;
  email: string;
  xrpl_address: string;
  xrpl_secret_encrypted: string;
  solana_address: string;
  solana_secret_encrypted: string;
  created_at: string;
}

function fromRow(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    xrplAddress: row.xrpl_address,
    xrplSecretEncrypted: row.xrpl_secret_encrypted,
    solanaAddress: row.solana_address,
    solanaSecretEncrypted: row.solana_secret_encrypted,
    createdAt: row.created_at,
  };
}

/** Find a user by email.

Args:
    db (Database.Database): Open database handle.
    email (string): The user's email, matched exactly (callers normalize case).

Returns:
    User | undefined: The user, or undefined if no account exists yet.
*/
export function getUserByEmail(db: Database.Database, email: string): User | undefined {
  const row = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as UserRow | undefined;
  return row ? fromRow(row) : undefined;
}

/** Find a user by ID.

Args:
    db (Database.Database): Open database handle.
    id (string): The user's ID.

Returns:
    User | undefined: The user, or undefined if not found.
*/
export function getUserById(db: Database.Database, id: string): User | undefined {
  const row = db.prepare('SELECT * FROM users WHERE id = ?').get(id) as UserRow | undefined;
  return row ? fromRow(row) : undefined;
}

/** Find a user by their custodial XRPL address.

Args:
    db (Database.Database): Open database handle.
    xrplAddress (string): The user's XRPL classic address.

Returns:
    User | undefined: The user, or undefined if no user holds this address.
*/
export function getUserByXrplAddress(db: Database.Database, xrplAddress: string): User | undefined {
  const row = db.prepare('SELECT * FROM users WHERE xrpl_address = ?').get(xrplAddress) as UserRow | undefined;
  return row ? fromRow(row) : undefined;
}

/** Create a user with freshly provisioned wallet addresses and encrypted secrets.

Args:
    db (Database.Database): Open database handle.
    email (string): The user's email.
    wallets: Addresses and encrypted secrets for the two custodial wallets.

Returns:
    User: The created user.
*/
export function createUser(
  db: Database.Database,
  email: string,
  wallets: {
    xrplAddress: string;
    xrplSecretEncrypted: string;
    solanaAddress: string;
    solanaSecretEncrypted: string;
  }
): User {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO users (id, email, xrpl_address, xrpl_secret_encrypted, solana_address, solana_secret_encrypted)
     VALUES (@id, @email, @xrplAddress, @xrplSecretEncrypted, @solanaAddress, @solanaSecretEncrypted)`
  ).run({ id, email, ...wallets });
  return getUserById(db, id) as User;
}
