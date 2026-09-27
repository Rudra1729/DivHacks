/**In-memory XRPL stand-in.

It mimics the one ledger behavior the guardrail story depends on: the agent
wallet can only send what it holds, so an overspend is rejected even when
nothing above it stops the request.
*/

import { XrplClient, XrplPaymentInput, XrplPaymentResult } from './types';

export const FAKE_AGENT_ADDRESS = 'rFakeAgentWallet';

export class FakeXrpl implements XrplClient {
  private balances = new Map<string, number>();
  private paidToday = new Map<string, number>();
  private txCounter = 0;

  /** Create the fake ledger.

  Args:
      agentBalance (number): Starting RLUSD balance of the agent wallet.
  */
  constructor(agentBalance = 10) {
    this.balances.set(FAKE_AGENT_ADDRESS, agentBalance);
  }

  /** Send RLUSD from the agent wallet.

  Args:
      input (XrplPaymentInput): Recipient, amount, and decision ID.

  Returns:
      XrplPaymentResult: A fake tx hash, or a ledger-style result code when
          the amount is invalid or the agent wallet cannot cover it.
  */
  async pay(input: XrplPaymentInput): Promise<XrplPaymentResult> {
    if (!Number.isFinite(input.amount) || input.amount <= 0) {
      return { ok: false, resultCode: 'temBAD_AMOUNT' };
    }
    const agentBalance = this.balances.get(FAKE_AGENT_ADDRESS) ?? 0;
    if (input.amount > agentBalance) {
      return { ok: false, resultCode: 'tecUNFUNDED_PAYMENT' };
    }

    this.balances.set(FAKE_AGENT_ADDRESS, agentBalance - input.amount);
    this.balances.set(
      input.recipient,
      (this.balances.get(input.recipient) ?? 0) + input.amount
    );
    this.paidToday.set(
      input.recipient,
      (this.paidToday.get(input.recipient) ?? 0) + input.amount
    );
    this.txCounter += 1;
    return { ok: true, txHash: `FAKE_TX_${this.txCounter}` };
  }

  async getBalance(address: string): Promise<number> {
    return this.balances.get(address) ?? 0;
  }

  /** Sum of payments to an address. The fake does not track dates. */
  async getPaidToday(address: string): Promise<number> {
    return this.paidToday.get(address) ?? 0;
  }
}
