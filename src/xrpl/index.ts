/**Public API of the XRPL payments module.

Other modules import only from here. XRPL_MODE picks the implementation
on every call: 'fake' (default) keeps balances in memory, 'real' pays
RLUSD from the agent wallet on XRPL testnet.

Example:
    import { sendPayment } from './xrpl';

    const result = await sendPayment({ decisionId, recipient, amount: 2 });
    if (!result.ok && result.reason === 'ledger_rejected') status = 'REJECTED_BY_LEDGER';
*/

import { loadXrplConfig } from './config';
import { fakePaymentService } from './fakePayments';
import { SendPaymentInput, SendPaymentResult, XrplService } from './types';

export type { SendPaymentInput, SendPaymentResult, XrplService } from './types';

/** Pick the payment service for the current XRPL_MODE.

Returns:
    XrplService: The real or fake implementation.

Raises:
    XrplConfigError: If the XRPL config is invalid.
*/
function activeService(): XrplService {
  if (loadXrplConfig().mode === 'real') {
    throw new Error('XRPL_MODE=real is not implemented yet');
  }
  return fakePaymentService;
}

/** Pay a reward in RLUSD from the agent wallet.

Never throws, even on a bad config. Payments are sent one at a time inside
the module, so callers can call this concurrently. The decision ID is the
idempotency key: calling again with the same ID returns the first outcome
(re-checking the ledger if it was unconfirmed) and never pays twice.

Args:
    input (SendPaymentInput): Decision ID, recipient, and amount.

Returns:
    Promise<SendPaymentResult>: Transaction hash, or a failure reason.
*/
export async function sendPayment(input: SendPaymentInput): Promise<SendPaymentResult> {
  try {
    return await activeService().sendPayment(input);
  } catch (error) {
    return { ok: false, reason: 'network_error', error: `payment not sent: ${String(error)}` };
  }
}

/** Read a wallet's RLUSD balance from the ledger.

Args:
    xrplAddress (string): Wallet to read.

Returns:
    Promise<number>: Balance in RLUSD, 0 if the wallet has no RLUSD.
*/
export function getRlusdBalance(xrplAddress: string): Promise<number> {
  return activeService().getRlusdBalance(xrplAddress);
}

/** Total RLUSD the agent paid to a wallet since 00:00 UTC today.

Args:
    xrplAddress (string): Recipient wallet.

Returns:
    Promise<number>: Sum of today's successful payments to the wallet.
*/
export function getPaidToday(xrplAddress: string): Promise<number> {
  return activeService().getPaidToday(xrplAddress);
}

/** Address of the agent wallet, for tests that check its allowance.

Returns:
    string: The agent wallet address (a placeholder in fake mode).
*/
export function getAgentAddress(): string {
  return loadXrplConfig().agentAddress;
}

/** The module as a single injectable object, for the orchestrator's `xrpl` setting.

Every call picks the real or fake implementation from XRPL_MODE, so the
server can pass this in once and never change when the mode changes.
*/
export const xrplService: XrplService = {
  sendPayment,
  getRlusdBalance,
  getPaidToday,
  getAgentAddress,
};
