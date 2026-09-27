/**Create and prepare every XRPL testnet wallet the demo needs.

Safe to run again: wallets already saved in .keys/xrpl-wallets.json are
reused, missing ones are created with the testnet faucet, and trust lines
are only sent when missing or wrong.

For each wallet this script:
    1. Creates it and funds it with test XRP from the faucet.
    2. Opens an RLUSD trust line so it can hold RLUSD. The agent's limit is
       10, so the ledger refuses to let it hold more than its allowance.
    3. Prints its address, balances, and explorer link.

Usage:
    npm run xrpl:setup
*/

import { Client, TrustSet, Wallet } from 'xrpl';
import { loadXrplConfig, XrplConfig } from '../../src/xrpl/config';
import { disconnectClient, getClient, isAccountNotFound, readAssetBalance } from '../../src/xrpl/client';
import {
  AGENT_TRUST_LIMIT,
  DEFAULT_TRUST_LIMIT,
  explorerAccountUrl,
  loadSavedWallets,
  saveWallets,
  WALLET_ROLES,
  WalletRole,
} from './common';

/** Make sure a wallet exists on the ledger, funding it from the faucet if needed.

Args:
    client (Client): Connected client.
    role (WalletRole): Which demo wallet this is.
    saved (Wallet | undefined): Previously saved wallet, if any.

Returns:
    Promise<Wallet>: A funded wallet.
*/
async function ensureFunded(client: Client, role: WalletRole, saved?: Wallet): Promise<Wallet> {
  if (saved) {
    try {
      await client.request({ command: 'account_info', account: saved.classicAddress });
      return saved;
    } catch (error) {
      if (!isAccountNotFound(error)) throw error;
      console.log(`  ${role}: saved wallet not on ledger (testnet reset?), refunding`);
      const { wallet } = await client.fundWallet(saved);
      return wallet;
    }
  }
  console.log(`  ${role}: creating wallet with the testnet faucet...`);
  const { wallet } = await client.fundWallet();
  return wallet;
}

/** Open or fix the wallet's RLUSD trust line.

Args:
    client (Client): Connected client.
    config (XrplConfig): Settings with the RLUSD issuer and currency.
    role (WalletRole): Which demo wallet this is, used to pick the limit.
    wallet (Wallet): Wallet that holds the trust line.

Raises:
    Error: If the TrustSet transaction does not succeed.
*/
async function ensureTrustLine(
  client: Client,
  config: XrplConfig,
  role: WalletRole,
  wallet: Wallet
): Promise<void> {
  const limit = role === 'agent' ? AGENT_TRUST_LIMIT : DEFAULT_TRUST_LIMIT;
  const lines = await client.request({
    command: 'account_lines',
    account: wallet.classicAddress,
    peer: config.rlusdIssuer,
  });
  const line = lines.result.lines.find((l) => l.currency === config.rlusdCurrency);
  if (line && Number(line.limit) === Number(limit)) {
    return;
  }

  const tx: TrustSet = {
    TransactionType: 'TrustSet',
    Account: wallet.classicAddress,
    LimitAmount: { currency: config.rlusdCurrency, issuer: config.rlusdIssuer, value: limit },
  };
  const result = await client.submitAndWait(tx, { wallet, autofill: true });
  const meta = result.result.meta;
  const code = typeof meta === 'object' && meta ? meta.TransactionResult : 'unknown';
  if (code !== 'tesSUCCESS') {
    throw new Error(`TrustSet for ${role} failed with ${code}`);
  }
  console.log(`  ${role}: RLUSD trust line set, limit ${limit}`);
}

/** Run the setup for every wallet role and print a summary. */
async function main(): Promise<void> {
  const config = loadXrplConfig({ ...process.env, XRPL_MODE: 'fake', XRPL_ASSET: 'RLUSD' });
  const client = await getClient(config);
  const saved = loadSavedWallets();
  const created = new Set<WalletRole>(WALLET_ROLES.filter((role) => !saved[role]));

  console.log('Preparing XRPL testnet wallets...');
  for (const role of WALLET_ROLES) {
    const wallet = await ensureFunded(client, role, saved[role]);
    saved[role] = wallet;
    saveWallets(saved);
    await ensureTrustLine(client, config, role, wallet);
  }

  console.log('\nWallets (saved in .keys/xrpl-wallets.json):');
  for (const role of WALLET_ROLES) {
    const wallet = saved[role]!;
    const xrp = await readAssetBalance(client, { ...config, asset: 'XRP' }, wallet.classicAddress);
    const rlusd = await readAssetBalance(client, config, wallet.classicAddress);
    console.log(`  ${role.padEnd(9)} ${wallet.classicAddress}  XRP ${xrp}  RLUSD ${rlusd}`);
    console.log(`            ${explorerAccountUrl(wallet.classicAddress)}`);
  }

  const treasuryRlusd = await readAssetBalance(client, config, saved.treasury!.classicAddress);
  console.log('\nNext steps:');
  if (treasuryRlusd === 0) {
    console.log(`  - Get test RLUSD at https://tryrlusd.com for the treasury: ${saved.treasury!.classicAddress}`);
  }
  if (created.has('agent')) {
    console.log('  - Add this line to .env (server, agent key only):');
    console.log(`       AGENT_SEED=${saved.agent!.seed}`);
  }
  if (created.has('treasury')) {
    console.log('  - Add this line to .env.guardian (guardian only, never .env):');
    console.log(`       TREASURY_SEED=${saved.treasury!.seed}`);
  }
  if (created.size === 0 && treasuryRlusd > 0) {
    console.log('  - Nothing to do. Seeds are only printed when a wallet is newly created.');
  }

  await disconnectClient();
}

main().catch(async (error) => {
  console.error(error);
  await disconnectClient();
  process.exit(1);
});
