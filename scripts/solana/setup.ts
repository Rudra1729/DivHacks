/**Create the Solana wallets and neighborhood collections on devnet.

Run with `npm run solana:setup`. Safe to run again: existing keypairs and
collections are reused, and SOL is only requested when the issuer is low.

Steps:
    1. Create the issuer, 3 demo, and 1 attacker keypairs in .keys/.
    2. Airdrop devnet SOL to the issuer if its balance is under 0.5 SOL.
    3. Create the Harlem and Morningside Heights collections.
    4. Print the values to copy into .env.
*/

import 'dotenv/config';
import { writeFileSync } from 'fs';
import { Umi, generateSigner, keypairIdentity, publicKey, sol } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { createCollection, mplCore } from '@metaplex-foundation/mpl-core';
import { loadSolanaConfig } from '../../src/solana/config';
import {
  ATTACKER_WALLET,
  COLLECTIONS_FILE,
  DEMO_WALLETS,
  ensureKeypair,
  explorerAddressUrl,
  keypairPath,
  readSavedCollections,
} from './common';

const MIN_ISSUER_SOL = 0.5;

const NEIGHBORHOODS = [
  { key: 'harlem', envVar: 'COLLECTION_HARLEM', name: 'WebPass NYC: Harlem' },
  { key: 'morningside', envVar: 'COLLECTION_MORNINGSIDE', name: 'WebPass NYC: Morningside Heights' },
] as const;

/** Make sure the issuer has enough devnet SOL, requesting an airdrop if not.

Args:
    umi (Umi): Client with the issuer as identity.

Returns:
    Promise<boolean>: True if the issuer has at least MIN_ISSUER_SOL afterwards.
*/
async function ensureIssuerFunded(umi: Umi): Promise<boolean> {
  const issuer = umi.identity.publicKey;
  let balance = Number((await umi.rpc.getBalance(issuer)).basisPoints) / 1e9;
  console.log(`Issuer balance: ${balance} SOL`);
  if (balance >= MIN_ISSUER_SOL) {
    return true;
  }

  try {
    console.log('Requesting 1 SOL airdrop...');
    await umi.rpc.airdrop(issuer, sol(1));
    balance = Number((await umi.rpc.getBalance(issuer)).basisPoints) / 1e9;
    console.log(`Issuer balance after airdrop: ${balance} SOL`);
  } catch (error) {
    console.log(`Airdrop failed: ${(error as Error).message}`);
  }

  if (balance < MIN_ISSUER_SOL) {
    console.log(
      `\nFund the issuer by hand, then run this script again:\n` +
        `  https://faucet.solana.com  (sign in with GitHub for a higher limit)\n` +
        `  Address: ${issuer}\n`
    );
    return false;
  }
  return true;
}

/** Create any neighborhood collection that does not exist on chain yet.

Args:
    umi (Umi): Client with the issuer as identity and payer.
    metadataBaseUrl (string): Base URL for collection metadata pages.

Returns:
    Promise<Record<string, string>>: Collection address per neighborhood key.
*/
async function ensureCollections(umi: Umi, metadataBaseUrl: string): Promise<Record<string, string>> {
  const saved = readSavedCollections() as Record<string, string | undefined>;
  const result: Record<string, string> = {};

  for (const hood of NEIGHBORHOODS) {
    const existing = process.env[hood.envVar] || saved[hood.key];
    if (existing && (await umi.rpc.accountExists(publicKey(existing)))) {
      console.log(`Collection ${hood.name} already exists: ${existing}`);
      result[hood.key] = existing;
      continue;
    }

    const collection = generateSigner(umi);
    await createCollection(umi, {
      collection,
      name: hood.name,
      uri: `${metadataBaseUrl}/collections/${hood.key}`,
    }).sendAndConfirm(umi);
    console.log(`Created collection ${hood.name}: ${collection.publicKey}`);
    result[hood.key] = collection.publicKey;
    writeFileSync(COLLECTIONS_FILE, JSON.stringify({ ...saved, ...result }, null, 2));
  }

  return result;
}

/** Run the full setup and print the values for .env.

Returns:
    Promise<void>: Resolves when setup is done. Sets a non-zero exit code on failure.
*/
async function main(): Promise<void> {
  const config = loadSolanaConfig({ ...process.env, SOLANA_MODE: 'fake' });
  const umi = createUmi(config.rpcUrl, 'confirmed').use(mplCore());

  const issuer = ensureKeypair(umi, config.issuerKeypairPath);
  umi.use(keypairIdentity(issuer.keypair));
  console.log(`Issuer ${issuer.created ? 'created' : 'loaded'}: ${issuer.keypair.publicKey}`);

  for (const name of [...DEMO_WALLETS, ATTACKER_WALLET]) {
    const wallet = ensureKeypair(umi, keypairPath(name));
    console.log(`${name.padEnd(9)} ${wallet.created ? 'created' : 'loaded '}: ${wallet.keypair.publicKey}`);
  }

  if (!(await ensureIssuerFunded(umi))) {
    process.exitCode = 1;
    return;
  }

  const collections = await ensureCollections(umi, config.metadataBaseUrl);

  console.log('\nCopy these into .env:');
  console.log(`SOLANA_ISSUER_KEYPAIR_PATH=${config.issuerKeypairPath}`);
  console.log(`COLLECTION_HARLEM=${collections.harlem}`);
  console.log(`COLLECTION_MORNINGSIDE=${collections.morningside}`);
  console.log('\nExplorer links:');
  console.log(`Issuer:      ${explorerAddressUrl(issuer.keypair.publicKey)}`);
  console.log(`Harlem:      ${explorerAddressUrl(collections.harlem)}`);
  console.log(`Morningside: ${explorerAddressUrl(collections.morningside)}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
