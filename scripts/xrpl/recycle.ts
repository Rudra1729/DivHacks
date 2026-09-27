/**Sweep test RLUSD from the demo wallets back to the treasury.

Rewards paid during testing land in wallets we own (user-1, user-2, user-3
and the attacker). This script sends whatever RLUSD they hold back to the
treasury so the same test funds can be reused. It never reverses anything:
each sweep is a new payment, recorded on the ledger with the memo
"recycle" so it is easy to tell apart from real rewards.

Only the demo wallets' keys are used. The treasury key and the agent key
are never touched, and this script must never be imported by the server.

Usage:
    npm run xrpl:recycle              sweep every demo wallet
    npm run xrpl:recycle -- --dry-run show what would be swept, send nothing
*/

import { convertStringToHex, Payment, Wallet } from 'xrpl';
import { disconnectClient, getClient } from '../../src/xrpl/client';
import { loadXrplConfig, XrplConfig } from '../../src/xrpl/config';
import { explorerTxUrl, requireWallet, WalletRole } from './common';

/** Demo wallets whose RLUSD is swept back. The agent is left to the guardian. */
const SWEEP_ROLES: WalletRole[] = ['user-1', 'user-2', 'user-3', 'attacker'];

/** Read a wallet's RLUSD balance as the exact decimal string the ledger holds.

Args:
    config (XrplConfig): Settings with the RLUSD issuer and currency code.
    address (string): Wallet to read.

Returns:
    Promise<string>: The balance, "0" if the wallet has no RLUSD trust line.
*/
async function rlusdBalanceString(config: XrplConfig, address: string): Promise<string> {
  const client = await getClient(config);
  const lines = await client.request({
    command: 'account_lines',
    account: address,
    peer: config.rlusdIssuer,
    ledger_index: 'validated',
  });
  return lines.result.lines.find((line) => line.currency === config.rlusdCurrency)?.balance ?? '0';
}

/** Send a wallet's whole RLUSD balance to the treasury.

Args:
    config (XrplConfig): Settings with the RLUSD issuer and currency code.
    role (WalletRole): Which demo wallet is being swept.
    wallet (Wallet): The demo wallet that sends.
    treasury (string): Treasury address that receives.
    amount (string): Exact balance to send.

Returns:
    Promise<boolean>: True if the ledger accepted the payment.
*/
async function sweep(
  config: XrplConfig,
  role: WalletRole,
  wallet: Wallet,
  treasury: string,
  amount: string
): Promise<boolean> {
  const client = await getClient(config);
  const tx: Payment = {
    TransactionType: 'Payment',
    Account: wallet.classicAddress,
    Destination: treasury,
    Amount: { currency: config.rlusdCurrency, issuer: config.rlusdIssuer, value: amount },
    Memos: [
      {
        Memo: {
          MemoType: convertStringToHex('recycle'),
          MemoData: convertStringToHex(`sweep ${role} to treasury`),
        },
      },
    ],
  };
  const result = await client.submitAndWait(tx, { wallet, autofill: true });
  const meta = result.result.meta;
  const code = typeof meta === 'object' && meta ? meta.TransactionResult : 'unknown';
  console.log(`  ${role}: sent ${amount} RLUSD, ${code}`);
  console.log(`            ${explorerTxUrl(result.result.hash)}`);
  return code === 'tesSUCCESS';
}

/** Sweep every demo wallet that holds RLUSD, or just list them with --dry-run. */
async function main(): Promise<void> {
  const dryRun = process.argv.includes('--dry-run');
  const config = loadXrplConfig({ ...process.env, XRPL_MODE: 'fake', XRPL_ASSET: 'RLUSD' });
  const treasury = requireWallet('treasury').classicAddress;
  let failed = false;
  let total = 0;

  console.log(`${dryRun ? 'Dry run: ' : ''}sweeping demo wallets to the treasury ${treasury}`);
  for (const role of SWEEP_ROLES) {
    const wallet = requireWallet(role);
    const balance = await rlusdBalanceString(config, wallet.classicAddress);
    if (Number(balance) <= 0) {
      console.log(`  ${role}: nothing to sweep`);
      continue;
    }
    total += Number(balance);
    if (dryRun) {
      console.log(`  ${role}: would send ${balance} RLUSD`);
      continue;
    }
    if (!(await sweep(config, role, wallet, treasury, balance))) failed = true;
  }

  const treasuryBalance = await rlusdBalanceString(config, treasury);
  console.log(`\n${dryRun ? 'Would sweep' : 'Swept'} ${total} RLUSD. Treasury holds ${treasuryBalance} RLUSD.`);
  await disconnectClient();
  process.exit(failed ? 1 : 0);
}

main().catch(async (error) => {
  console.error(error);
  await disconnectClient();
  process.exit(1);
});
