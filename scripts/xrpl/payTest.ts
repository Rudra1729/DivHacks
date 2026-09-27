/**Acceptance test for XRPL payments on testnet.

Runs the two payments from the PRD through the real payment service:
    1. 2 RLUSD to demo user-1. Expected: success.
    2. 50 RLUSD to the attacker while the agent holds at most 10.
       Expected: rejected by the ledger.
Both transactions carry a decision ID memo and are printed with explorer links.

Usage:
    npm run xrpl:pay-test
    XRPL_ASSET=XRP npm run xrpl:pay-test   (fallback check, attack uses 1000 XRP)
*/

import { randomUUID } from 'crypto';
import { disconnectClient } from '../../src/xrpl/client';
import { getAgentAddress, getPaidToday, getRlusdBalance, sendPayment, SendPaymentResult } from '../../src/xrpl';
import { loadXrplConfig } from '../../src/xrpl/config';
import { explorerTxUrl, requireWallet } from './common';

/** Print one payment result with its explorer link.

Args:
    label (string): What this payment was.
    decisionId (string): Decision ID sent in the memo.
    result (SendPaymentResult): Result from sendPayment.
*/
function report(label: string, decisionId: string, result: SendPaymentResult): void {
  console.log(`\n${label}`);
  console.log(`  decision ID: ${decisionId}`);
  console.log(`  result:      ${JSON.stringify(result)}`);
  if (result.txHash) {
    console.log(`  explorer:    ${explorerTxUrl(result.txHash)}`);
  }
}

/** Run the happy-path and overspend payments and report pass or fail. */
async function main(): Promise<void> {
  process.env.XRPL_MODE = 'real';
  const config = loadXrplConfig();
  const unit = config.asset;
  const attackAmount = unit === 'XRP' ? 1000 : 50;
  const user = requireWallet('user-1').classicAddress;
  const attacker = requireWallet('attacker').classicAddress;

  console.log(`Agent ${getAgentAddress()} holds ${await getRlusdBalance(getAgentAddress())} ${unit}`);

  const goodId = randomUUID();
  const good = await sendPayment({ decisionId: goodId, userXrplAddress: user, amount: 2 });
  report(`1. Pay 2 ${unit} to user-1 (expect success)`, goodId, good);

  const attackId = randomUUID();
  const attack = await sendPayment({ decisionId: attackId, userXrplAddress: attacker, amount: attackAmount });
  report(`2. Pay ${attackAmount} ${unit} to attacker (expect ledger rejection)`, attackId, attack);

  console.log(`\nuser-1 paid today: ${await getPaidToday(user)} ${unit}`);
  console.log(`attacker balance:  ${await getRlusdBalance(attacker)} ${unit}`);
  console.log(`agent balance now: ${await getRlusdBalance(getAgentAddress())} ${unit}`);

  const passed = good.ok && !attack.ok && attack.reason === 'ledger_rejected';
  console.log(passed ? '\nPASS' : '\nFAIL');
  await disconnectClient();
  process.exit(passed ? 0 : 1);
}

main().catch(async (error) => {
  console.error(error);
  await disconnectClient();
  process.exit(1);
});
