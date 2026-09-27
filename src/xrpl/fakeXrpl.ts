/**In-memory XRPL stand-in.

It mimics the ledger behavior the guardrail story depends on: the agent
wallet can only send what it holds, so an overspend is rejected even when
nothing above it stops the request. Like the real module it never throws and
never pays twice for the same decision ID.
*/

import { SendPaymentInput, SendPaymentResult, XrplService } from './types';

export const FAKE_AGENT_ADDRESS = 'rFakeAgentWallet';

export class FakeXrpl implements XrplService {
  private balances = new Map<string, number>();
  private paidToday = new Map<string, number>();
  private results = new Map<string, SendPaymentResult>();
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
      input (SendPaymentInput): Recipient, amount, and decision ID.

  Returns:
      SendPaymentResult: A fake tx hash, or a rejection. A repeated decision
          ID returns the first result without paying again.
  */
  async sendPayment(input: SendPaymentInput): Promise<SendPaymentResult> {
    const earlier = this.results.get(input.decisionId);
    if (earlier) {
      return earlier;
    }
    const result = this.attempt(input);
    this.results.set(input.decisionId, result);
    return result;
  }

  async getRlusdBalance(xrplAddress: string): Promise<number> {
    return this.balances.get(xrplAddress) ?? 0;
  }

  /** Sum of payments to an address. The fake does not track dates. */
  async getPaidToday(xrplAddress: string): Promise<number> {
    return this.paidToday.get(xrplAddress) ?? 0;
  }

  getAgentAddress(): string {
    return FAKE_AGENT_ADDRESS;
  }

  private attempt(input: SendPaymentInput): SendPaymentResult {
    const { recipient, amount } = input;
    if (!recipient) {
      return { ok: false, reason: 'invalid_input', error: 'recipient is empty' };
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, reason: 'invalid_input', error: `amount must be greater than 0: got ${amount}` };
    }
    if (Math.abs(amount * 100 - Math.round(amount * 100)) > 1e-6) {
      return { ok: false, reason: 'invalid_input', error: `amount has more than 2 decimals: ${amount}` };
    }

    const agentBalance = this.balances.get(FAKE_AGENT_ADDRESS) ?? 0;
    if (amount > agentBalance) {
      return {
        ok: false,
        reason: 'ledger_rejected',
        resultCode: 'tecPATH_PARTIAL',
        error: `agent wallet holds ${agentBalance} RLUSD, payment needs ${amount}`,
      };
    }

    this.balances.set(FAKE_AGENT_ADDRESS, agentBalance - amount);
    this.balances.set(recipient, (this.balances.get(recipient) ?? 0) + amount);
    this.paidToday.set(recipient, (this.paidToday.get(recipient) ?? 0) + amount);
    this.txCounter += 1;
    return { ok: true, txHash: `FAKE_TX_${this.txCounter}`, resultCode: 'tesSUCCESS' };
  }
}
