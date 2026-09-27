/**Start a new season: every place restarts at stamp #1 for everyone.

Stamps are soulbound and can never be deleted, and stamp numbering and the
once-per-place check both count stamps in the current neighborhood
collections. So a new season:
    1. Creates fresh Harlem and Morningside Heights collections on devnet
       (real Solana mode only) and writes them into .env and .keys/.
    2. Clears every visit from the database (accounts and wallets stay).

Old stamps stay on chain in the old collections, visible in the Solana
Explorer, but no longer count in the app. RLUSD balances are untouched.
Restart the server afterwards so it picks up the new collections.

Usage:
    npm run season:new
*/

import 'dotenv/config';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { Umi, generateSigner, keypairIdentity } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createCollection, mplCore } from '@metaplex-foundation/mpl-core';
import { loadSolanaConfig } from '../../src/solana/config';
import { openDatabase } from '../../src/db';
import { clearAllVisits } from '../../src/db/clearVisits';
import { COLLECTIONS_FILE, ensureKeypair, explorerAddressUrl, readSavedCollections } from './common';

const ENV_FILE = '.env';
const MIN_ISSUER_SOL = 0.01;

const NEIGHBORHOODS = [
  { key: 'harlem', envVar: 'COLLECTION_HARLEM', name: 'WebPass NYC: Harlem' },
  { key: 'morningside', envVar: 'COLLECTION_MORNINGSIDE', name: 'WebPass NYC: Morningside Heights' },
] as const;

/** Set KEY=value lines in an env file, replacing existing lines or appending new ones.

Args:
    path (string): The env file.
    values (Record<string, string>): Keys and the values to write.
*/
function setEnvValues(path: string, values: Record<string, string>): void {
  let text = existsSync(path) ? readFileSync(path, 'utf8') : '';
  for (const [key, value] of Object.entries(values)) {
    const line = `${key}=${value}`;
    const pattern = new RegExp(`^${key}=.*$`, 'm');
    text = pattern.test(text) ? text.replace(pattern, line) : `${text.replace(/\n?$/, '\n')}${line}\n`;
  }
  writeFileSync(path, text);
}

/** Create one fresh collection per neighborhood.

Args:
    umi (Umi): Client with the issuer as identity and payer.
    metadataBaseUrl (string): Base URL for collection metadata pages.

Returns:
    Promise<Record<string, string>>: New collection address per neighborhood key.
*/
async function createCollections(umi: Umi, metadataBaseUrl: string): Promise<Record<string, string>> {
  const created: Record<string, string> = {};
  for (const hood of NEIGHBORHOODS) {
    const collection = generateSigner(umi);
    await createCollection(umi, {
      collection,
      name: hood.name,
      uri: `${metadataBaseUrl}/collections/${hood.key}`,
    }).sendAndConfirm(umi);
    created[hood.key] = collection.publicKey;
    console.log(`Created ${hood.name}: ${explorerAddressUrl(collection.publicKey)}`);
  }
  return created;
}

/** Start the new season and print what changed.

Returns:
    Promise<void>: Resolves when done. Sets a non-zero exit code on failure.
*/
async function main(): Promise<void> {
  const config = loadSolanaConfig();

  if (config.mode === 'real') {
    const umi = createUmi(config.rpcUrl, 'confirmed').use(mplCore());
    if (!existsSync(config.issuerKeypairPath)) {
      throw new Error(`issuer keypair not found at ${config.issuerKeypairPath}, run npm run solana:setup first`);
    }
    umi.use(keypairIdentity(ensureKeypair(umi, config.issuerKeypairPath).keypair));
    const balance = Number((await umi.rpc.getBalance(umi.identity.publicKey)).basisPoints) / 1e9;
    if (balance < MIN_ISSUER_SOL) {
      throw new Error(
        `issuer ${umi.identity.publicKey} has ${balance} SOL, needs ${MIN_ISSUER_SOL}. Fund it at https://faucet.solana.com`
      );
    }

    const created = await createCollections(umi, config.metadataBaseUrl);
    setEnvValues(ENV_FILE, { COLLECTION_HARLEM: created.harlem, COLLECTION_MORNINGSIDE: created.morningside });
    writeFileSync(COLLECTIONS_FILE, JSON.stringify({ ...readSavedCollections(), ...created }, null, 2));
    console.log(`Old collections: ${config.collections.harlem}, ${config.collections.morningside}`);
    console.log('Wrote the new collections to .env and .keys/collections.json.');
  } else {
    console.log('SOLANA_MODE is fake, so only the database is cleared.');
  }

  const db = openDatabase(process.env.DB_PATH ?? 'webpass.sqlite');
  const cleared = clearAllVisits(db);
  db.close();
  console.log(
    `Cleared ${cleared.decisions} visits, ${cleared.claims} claims, ${cleared.audit_events} audit events, ` +
      `${cleared.photo_fingerprints} photo fingerprints, ${cleared.location_history} GPS points.`
  );
  console.log('\nRestart the server (npm run dev) so every place starts at #1.');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
