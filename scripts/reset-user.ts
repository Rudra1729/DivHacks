/**Reset a user's visits and stamps so they can test every place again.

Deletes the user's visits from the database and gives them a fresh Solana
wallet (stamps are soulbound, so the old ones stay on the old wallet). The
XRPL wallet and its RLUSD balance are kept. Safe to run while the server is
up; the page picks up the new wallet on its next refresh.

Usage:
    npm run reset:user -- someone@example.com
    DB_PATH=other.sqlite npm run reset:user -- someone@example.com
*/

import { provisionWallets } from '../src/auth/provisionWallet';
import { openDatabase } from '../src/db';
import { resetUser } from '../src/db/resetUser';

/** Reset the user named on the command line and print what changed. */
function main(): void {
  const email = process.argv[2];
  if (!email) {
    console.error('Usage: npm run reset:user -- <email>');
    process.exit(1);
  }

  const db = openDatabase(process.env.DB_PATH ?? 'webpass.sqlite');
  const { solanaAddress, solanaSecretEncrypted } = provisionWallets();
  const summary = resetUser(db, email, { solanaAddress, solanaSecretEncrypted });
  db.close();

  const { deleted } = summary;
  console.log(`Reset ${summary.email}`);
  console.log(`  Solana wallet: ${summary.oldSolanaAddress} -> ${summary.newSolanaAddress}`);
  console.log(`  XRPL wallet kept: ${summary.xrplAddress}`);
  console.log(
    `  Deleted: ${deleted.decisions} visits, ${deleted.claims} claims, ${deleted.auditEvents} audit events, ` +
      `${deleted.photoFingerprints} photo fingerprints, ${deleted.locationHistory} GPS points, ` +
      `${deleted.stampRetries} stamp retries`
  );
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
