/**Reset a user's visits so they can test every place again.

Stamps are soulbound on Solana and can never be removed, so a reset gives
the user a fresh Solana wallet instead: the old stamps stay on the old
wallet, and the once-per-place check (which asks Solana about the wallet a
visit is submitted with) starts clean. Everything the database keeps about
the user's visits is deleted in one transaction. The XRPL wallet and its
RLUSD balance are left alone.
*/

import Database from 'better-sqlite3';
import { getUserByEmail } from './users';

/** A freshly generated Solana wallet, secret already encrypted. */
export interface NewSolanaWallet {
  solanaAddress: string;
  solanaSecretEncrypted: string;
}

/** What a reset changed, safe to print (no secrets). */
export interface ResetSummary {
  email: string;
  xrplAddress: string;
  oldSolanaAddress: string;
  newSolanaAddress: string;
  deleted: {
    decisions: number;
    auditEvents: number;
    claims: number;
    stampRetries: number;
    photoFingerprints: number;
    locationHistory: number;
  };
}

/** Delete a user's visits and move them to a new Solana wallet.

Args:
    db (Database.Database): Open database handle.
    email (string): Email of the user to reset.
    wallet (NewSolanaWallet): The Solana wallet the user gets from now on.

Returns:
    ResetSummary: The addresses involved and how many rows were deleted.

Raises:
    Error: If no user has that email.
*/
export function resetUser(db: Database.Database, email: string, wallet: NewSolanaWallet): ResetSummary {
  const user = getUserByEmail(db, email);
  if (!user) {
    throw new Error(`no user with email ${email}`);
  }
  const addresses = { xrpl: user.xrplAddress, solana: user.solanaAddress };
  const decisionIds = `(
    SELECT id FROM decisions WHERE xrpl_address = @xrpl OR solana_address = @solana
    UNION
    SELECT decision_id FROM claims WHERE decision_id IS NOT NULL AND (xrpl_address = @xrpl OR solana_address = @solana)
  )`;
  const run = (sql: string): number => db.prepare(sql).run(addresses).changes;

  const deleted = db.transaction(() => {
    const counts = {
      photoFingerprints: run(`DELETE FROM photo_fingerprints WHERE decision_id IN ${decisionIds}`),
      auditEvents: run(`DELETE FROM audit_events WHERE decision_id IN ${decisionIds}`),
      stampRetries: run(`DELETE FROM stamp_retries WHERE decision_id IN ${decisionIds} OR solana_address = @solana`),
      decisions: run(`DELETE FROM decisions WHERE id IN ${decisionIds}`),
      claims: run('DELETE FROM claims WHERE xrpl_address = @xrpl OR solana_address = @solana'),
      locationHistory: run('DELETE FROM location_history WHERE xrpl_address = @xrpl OR solana_address = @solana'),
    };
    db.prepare('UPDATE users SET solana_address = ?, solana_secret_encrypted = ? WHERE id = ?').run(
      wallet.solanaAddress,
      wallet.solanaSecretEncrypted,
      user.id
    );
    return counts;
  })();

  return {
    email: user.email,
    xrplAddress: user.xrplAddress,
    oldSolanaAddress: user.solanaAddress,
    newSolanaAddress: wallet.solanaAddress,
    deleted,
  };
}
