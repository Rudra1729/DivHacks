/**Helpers shared by the XRPL scripts in this folder.

Keeps the wallet roles, the wallets file, trust line limits, and explorer
links in one place so setup, the payment test, and the guardian agree.
*/

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { Wallet } from 'xrpl';

export const WALLET_ROLES = ['treasury', 'agent', 'user-1', 'user-2', 'user-3', 'attacker'] as const;
export type WalletRole = (typeof WALLET_ROLES)[number];

export const WALLETS_FILE = join('.keys', 'xrpl-wallets.json');

/** Agent trust line limit. The ledger refuses to let the agent hold more than this. */
export const AGENT_TRUST_LIMIT = '10';
export const DEFAULT_TRUST_LIMIT = '1000000';

/** Load the wallets saved by a previous setup run.

Returns:
    Partial<Record<WalletRole, Wallet>>: Saved wallets by role, empty if none.
*/
export function loadSavedWallets(): Partial<Record<WalletRole, Wallet>> {
  if (!existsSync(WALLETS_FILE)) {
    return {};
  }
  const seeds = JSON.parse(readFileSync(WALLETS_FILE, 'utf8')) as Record<string, string>;
  const wallets: Partial<Record<WalletRole, Wallet>> = {};
  for (const role of WALLET_ROLES) {
    if (seeds[role]) {
      wallets[role] = Wallet.fromSeed(seeds[role]);
    }
  }
  return wallets;
}

/** Save wallet seeds by role to the gitignored keys folder.

Args:
    wallets (Partial<Record<WalletRole, Wallet>>): Wallets to save.
*/
export function saveWallets(wallets: Partial<Record<WalletRole, Wallet>>): void {
  const seeds: Record<string, string> = {};
  for (const role of WALLET_ROLES) {
    const seed = wallets[role]?.seed;
    if (seed) seeds[role] = seed;
  }
  mkdirSync(dirname(WALLETS_FILE), { recursive: true });
  writeFileSync(WALLETS_FILE, JSON.stringify(seeds, null, 2));
}

/** Load one saved wallet, failing with a clear message if setup has not run.

Args:
    role (WalletRole): Which wallet to load.

Returns:
    Wallet: The saved wallet.

Raises:
    Error: If the wallet is not in the wallets file.
*/
export function requireWallet(role: WalletRole): Wallet {
  const wallet = loadSavedWallets()[role];
  if (!wallet) {
    throw new Error(`No ${role} wallet in ${WALLETS_FILE}. Run npm run xrpl:setup first.`);
  }
  return wallet;
}

/** Build a testnet explorer link for an account.

Args:
    address (string): XRPL address.

Returns:
    string: testnet.xrpl.org account URL.
*/
export function explorerAccountUrl(address: string): string {
  return `https://testnet.xrpl.org/accounts/${address}`;
}

/** Build a testnet explorer link for a transaction.

Args:
    hash (string): Transaction hash.

Returns:
    string: testnet.xrpl.org transaction URL.
*/
export function explorerTxUrl(hash: string): string {
  return `https://testnet.xrpl.org/transactions/${hash}`;
}
