/**Pure decision rules for the treasury guardian.

The guardian tops the agent wallet up to a fixed allowance. These functions
decide how much to send and whether recent agent activity looks abnormal
enough to hold the top-up. They do no I/O and never touch a key, so they are
easy to test and safe to keep inside the server's source tree. The process
that holds the treasury key lives in the top-level guardian folder.
*/

/** Limits the guardian enforces.

Attributes:
    targetBalance (number): RLUSD the agent wallet is topped up to, never above.
    windowMinutes (number): How far back recent agent activity is examined.
    maxWindowSpend (number): Most RLUSD the agent may pay out within the window.
    maxSinglePayment (number): Largest single payment considered normal.
    knownRecipients (string[]): If not empty, the only addresses the agent may pay.
*/
export interface GuardianLimits {
  targetBalance: number;
  windowMinutes: number;
  maxWindowSpend: number;
  maxSinglePayment: number;
  knownRecipients: string[];
}

/** One payment sent by the agent wallet, as read from the ledger.

Attributes:
    hash (string): Transaction hash.
    to (string): Recipient address.
    amount (number): RLUSD amount, delivered if it succeeded, attempted if not.
    isRlusd (boolean): False if the payment was in some other asset.
    resultCode (string): Ledger result, such as tesSUCCESS or tecPATH_PARTIAL.
*/
export interface AgentPayment {
  hash: string;
  to: string;
  amount: number;
  isRlusd: boolean;
  resultCode: string;
}

/** Everything the guardian learned about the agent wallet's recent activity.

Attributes:
    payments (AgentPayment[]): Payments the agent sent within the window.
    dangerousTransactions (string[]): Descriptions of account-changing
        transactions, such as changing signing keys or account settings.
    trustLimit (number | null): The agent's RLUSD trust line limit, or null
        if it has no trust line.
*/
export interface AgentActivity {
  payments: AgentPayment[];
  dangerousTransactions: string[];
  trustLimit: number | null;
}

/** What the guardian will do this cycle.

action 'topup' sends `amount` RLUSD. action 'none' sends nothing and says why.
*/
export type TopUpPlan = { action: 'topup'; amount: number } | { action: 'none'; reason: string };

/** Round an amount down to 2 decimals, so a top-up never overshoots.

Args:
    value (number): Amount to round.

Returns:
    number: The amount rounded toward zero to 2 decimals.
*/
export function floor2(value: number): number {
  return Math.floor(value * 100 + 1e-9) / 100;
}

/** Work out how much to send to bring the agent back up to its allowance.

Never plans to send more than the shortfall, and never more than the
treasury holds.

Args:
    agentBalance (number): RLUSD the agent wallet holds now.
    treasuryBalance (number): RLUSD the treasury holds now.
    target (number): The allowance to top the agent up to.

Returns:
    TopUpPlan: A top-up amount, or a reason to send nothing.
*/
export function planTopUp(agentBalance: number, treasuryBalance: number, target: number): TopUpPlan {
  const shortfall = floor2(target - agentBalance);
  if (shortfall <= 0) {
    return { action: 'none', reason: `agent already holds ${agentBalance} RLUSD, allowance is ${target}` };
  }
  const available = floor2(treasuryBalance);
  if (available <= 0) {
    return { action: 'none', reason: `treasury is empty, agent needs ${shortfall} RLUSD` };
  }
  return { action: 'topup', amount: Math.min(shortfall, available) };
}

/** Check recent agent activity for signs of abuse.

Args:
    activity (AgentActivity): What the agent did within the window.
    limits (GuardianLimits): The limits to hold it to.

Returns:
    string[]: Plain-language reasons the activity looks abnormal. Empty means
        it looks normal and the top-up may go ahead.
*/
export function evaluateActivity(activity: AgentActivity, limits: GuardianLimits): string[] {
  const reasons: string[] = [];
  const window = `in the last ${limits.windowMinutes} minutes`;

  const rejected = activity.payments.filter((p) => p.resultCode !== 'tesSUCCESS');
  if (rejected.length > 0) {
    const codes = [...new Set(rejected.map((p) => p.resultCode))].join(', ');
    reasons.push(`${rejected.length} payment attempt(s) refused by the ledger ${window} (${codes})`);
  }

  const paid = activity.payments.filter((p) => p.resultCode === 'tesSUCCESS');

  if (paid.some((p) => !p.isRlusd)) {
    reasons.push(`the agent sent something other than RLUSD ${window}`);
  }

  const rlusdPaid = paid.filter((p) => p.isRlusd);
  const largest = Math.max(0, ...rlusdPaid.map((p) => p.amount));
  if (largest > limits.maxSinglePayment) {
    reasons.push(`a single payment of ${largest} RLUSD is above the ${limits.maxSinglePayment} RLUSD per-payment limit`);
  }

  const total = rlusdPaid.reduce((sum, p) => sum + p.amount, 0);
  if (total > limits.maxWindowSpend) {
    reasons.push(`the agent paid out ${total} RLUSD ${window}, above the ${limits.maxWindowSpend} RLUSD limit`);
  }

  if (limits.knownRecipients.length > 0) {
    const unknown = [...new Set(rlusdPaid.filter((p) => !limits.knownRecipients.includes(p.to)).map((p) => p.to))];
    if (unknown.length > 0) {
      reasons.push(`payment to address(es) not on the known list: ${unknown.join(', ')}`);
    }
  }

  if (activity.dangerousTransactions.length > 0) {
    reasons.push(`the agent account was changed ${window}: ${activity.dangerousTransactions.join(', ')}`);
  }

  if (activity.trustLimit !== null && activity.trustLimit > limits.targetBalance) {
    reasons.push(`the agent's RLUSD trust line limit is ${activity.trustLimit}, above its ${limits.targetBalance} allowance`);
  }

  return reasons;
}
