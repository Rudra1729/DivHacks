/**Helpers shared by the Solana scripts in this folder.

Keeps keypair file names, the demo place, and explorer links in one place
so setup, mint test, and transfer test agree on them.
*/

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { Keypair, Umi } from '@metaplex-foundation/umi';
import { loadKeypairFile } from '../../src/solana/client';
import { StampPlace } from '../../src/solana/places';

export const KEYS_DIR = '.keys';
export const DEMO_WALLETS = ['demo-1', 'demo-2', 'demo-3'];
export const ATTACKER_WALLET = 'attacker';
export const COLLECTIONS_FILE = join(KEYS_DIR, 'collections.json');

/** Place used by the test scripts when the shared places file is not ready. */
export const DEMO_PLACE: StampPlace = {
  id: 'demo-apollo-theater',
  name: 'Apollo Theater',
  neighborhood: 'Harlem',
  imageUrl: '',
};

/** Build the path of a named keypair file in the keys folder.

Args:
    name (string): Wallet name, for example 'demo-1'.

Returns:
    string: Path such as '.keys/demo-1.json'.
*/
export function keypairPath(name: string): string {
  return join(KEYS_DIR, `${name}.json`);
}

/** Load a keypair file, or generate and save a new one if it does not exist.

Args:
    umi (Umi): Umi instance used to generate or rebuild the keypair.
    path (string): Keypair file path.

Returns:
    { keypair: Keypair, created: boolean }: The keypair and whether it is new.
*/
export function ensureKeypair(umi: Umi, path: string): { keypair: Keypair; created: boolean } {
  if (existsSync(path)) {
    return { keypair: loadKeypairFile(umi, path), created: false };
  }
  const keypair = umi.eddsa.generateKeypair();
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(Array.from(keypair.secretKey)), { mode: 0o600 });
  return { keypair, created: true };
}

/** Read collection addresses saved by the setup script.

Returns:
    { harlem?: string, morningside?: string }: Saved addresses, empty if none.
*/
export function readSavedCollections(): { harlem?: string; morningside?: string } {
  if (!existsSync(COLLECTIONS_FILE)) {
    return {};
  }
  return JSON.parse(readFileSync(COLLECTIONS_FILE, 'utf8'));
}

/** Build a Solana devnet explorer link for an address.

Args:
    address (string): Account or asset address.

Returns:
    string: Explorer URL on devnet.
*/
export function explorerAddressUrl(address: string): string {
  return `https://explorer.solana.com/address/${address}?cluster=devnet`;
}

/** Build a Solana devnet explorer link for a transaction.

Args:
    signature (string): Base58 transaction signature.

Returns:
    string: Explorer URL on devnet.
*/
export function explorerTxUrl(signature: string): string {
  return `https://explorer.solana.com/tx/${signature}?cluster=devnet`;
}
