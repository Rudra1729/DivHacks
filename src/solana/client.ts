/**Umi client for Solana devnet, with the issuer wallet as identity.

The issuer pays for every mint and is the update authority of both
neighborhood collections. Its keypair is read from a local JSON file in
the Solana CLI format and is never committed.
*/

import { readFileSync } from 'fs';
import { Keypair, Umi, keypairIdentity } from '@metaplex-foundation/umi';
import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { mplCore } from '@metaplex-foundation/mpl-core';
import { SolanaConfig, SolanaConfigError, loadSolanaConfig } from './config';

let cachedClient: Umi | undefined;

/** Read a Solana CLI keypair file (a JSON array of 64 bytes).

Args:
    umi (Umi): Umi instance used to rebuild the keypair.
    path (string): Path to the keypair file.

Returns:
    Keypair: The loaded keypair.

Raises:
    SolanaConfigError: If the file is missing or not a 64-byte secret key.
*/
export function loadKeypairFile(umi: Umi, path: string): Keypair {
  let bytes: unknown;
  try {
    bytes = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new SolanaConfigError(
      `Could not read Solana keypair at ${path}. Run npm run solana:setup first. (${(error as Error).message})`
    );
  }
  if (!Array.isArray(bytes) || bytes.length !== 64) {
    throw new SolanaConfigError(`Keypair file ${path} must be a JSON array of 64 numbers.`);
  }
  return umi.eddsa.createKeypairFromSecretKey(Uint8Array.from(bytes as number[]));
}

/** Create a new Umi client with Metaplex Core and the issuer as identity.

Args:
    config (SolanaConfig): Resolved Solana configuration.

Returns:
    Umi: A client that signs and pays with the issuer wallet.

Raises:
    SolanaConfigError: If the issuer keypair cannot be loaded.
*/
export function createSolanaClient(config: SolanaConfig): Umi {
  const umi = createUmi(config.rpcUrl, 'confirmed').use(mplCore());
  return umi.use(keypairIdentity(loadKeypairFile(umi, config.issuerKeypairPath)));
}

/** Return the shared Umi client, creating it on first use.

Returns:
    Umi: The process-wide Solana client.
*/
export function getSolanaClient(): Umi {
  if (!cachedClient) {
    cachedClient = createSolanaClient(loadSolanaConfig());
  }
  return cachedClient;
}
