/**In-memory payment service with the same API as the real one.

Used while XRPL_MODE=fake so the orchestrator can integrate before real
XRPL payments are wired in. The agent wallet starts with a 10 RLUSD
allowance, and paying more than it holds is rejected the same way the
ledger would, so the bypass test can run against the fake.
*/

import { amountProblem, startOfUtcDay } from './amount';
import { loadXrplConfig } from './config';
import { SendPaymentInput, SendPaymentResult, XrplService } from './types';

interface FakePayment {
  to: string;
  amount: number;
  at: Date;
}

/** Fake payment service that tracks balances in memory.

Attributes:
    agentBalance (number | null): Current agent balance, set on first use.
    balances (Map<string, number>): Balances of wallets paid by the agent.
    payments (FakePayment[]): Successful payments, in order.
    txCount (number): Number of fake transactions, used for fake hashes.
    results (Map<string, SendPaymentResult>): First result per decision ID.
*/
export class FakePaymentService implements XrplService {
  private agentBalance: number | null = null;
  private balances = new Map<string, number>();
  private payments: FakePayment[] = [];
  private txCount = 0;
  private results = new Map<string, SendPaymentResult>();

  /** Pay a reward from the fake agent wallet.

  Calling it again with the same decision ID returns the first result and
  moves no money.

  Args:
      input (SendPaymentInput): Decision ID, recipient, and amount.

  Returns:
      Promise<SendPaymentResult>: A fake hash, or a ledger-style rejection
          when the amount is more than the agent holds.
  */
  async sendPayment(input: SendPaymentInput): Promise<SendPaymentResult> {
    const problem = amountProblem(input.amount);
    if (problem) {
      return { ok: false, reason: 'invalid_input', error: problem };
    }

    const previous = this.results.get(input.decisionId);
    if (previous) {
      return previous;
    }
    const result = this.pay(input);
    this.results.set(input.decisionId, result);
    return result;
  }

  /** Move fake money for a new decision.

  Args:
      input (SendPaymentInput): Decision ID, recipient, and amount.

  Returns:
      SendPaymentResult: Success, or a ledger-style rejection.
  */
  private pay(input: SendPaymentInput): SendPaymentResult {
    const balance = this.currentAgentBalance();
    this.txCount += 1;
    const txHash = `FAKE${String(this.txCount).padStart(60, '0')}`;

    if (input.amount > balance) {
      return {
        ok: false,
        reason: 'ledger_rejected',
        resultCode: 'tecPATH_PARTIAL',
        txHash,
        error: `agent wallet holds ${balance} RLUSD, cannot pay ${input.amount}`,
      };
    }

    this.agentBalance = balance - input.amount;
    const received = this.balances.get(input.recipient) ?? 0;
    this.balances.set(input.recipient, received + input.amount);
    this.payments.push({ to: input.recipient, amount: input.amount, at: new Date() });
    return { ok: true, txHash, resultCode: 'tesSUCCESS' };
  }

  /** Read a fake RLUSD balance.

  Args:
      xrplAddress (string): Wallet to read. The agent address returns the allowance left.

  Returns:
      Promise<number>: Balance in RLUSD, 0 for unknown wallets.
  */
  async getRlusdBalance(xrplAddress: string): Promise<number> {
    if (xrplAddress === loadXrplConfig().agentAddress) {
      return this.currentAgentBalance();
    }
    return this.balances.get(xrplAddress) ?? 0;
  }

  /** Total paid to a wallet since 00:00 UTC today.

  Args:
      xrplAddress (string): Recipient wallet.

  Returns:
      Promise<number>: Sum of today's successful payments to the wallet.
  */
  async getPaidToday(xrplAddress: string): Promise<number> {
    const since = startOfUtcDay();
    return this.payments
      .filter((payment) => payment.to === xrplAddress && payment.at >= since)
      .reduce((sum, payment) => sum + payment.amount, 0);
  }

  /** Address of the fake agent wallet.

  Returns:
      string: The agent address from the XRPL config.
  */
  getAgentAddress(): string {
    return loadXrplConfig().agentAddress;
  }

  /** Forget all fake state and restore the starting allowance. Used between tests. */
  reset(): void {
    this.agentBalance = null;
    this.balances.clear();
    this.payments = [];
    this.txCount = 0;
    this.results.clear();
  }

  private currentAgentBalance(): number {
    if (this.agentBalance === null) {
      this.agentBalance = loadXrplConfig().fakeAgentBalance;
    }
    return this.agentBalance;
  }
}

/** Shared fake service used when XRPL_MODE=fake. */
export const fakePaymentService = new FakePaymentService();
