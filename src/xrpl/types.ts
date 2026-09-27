/**Shared types for the XRPL payments module.

These types are the hand-off contract agreed with the orchestrator owner.
The orchestrator and policy engine use them through src/xrpl/index.ts.
*/

/** Everything the orchestrator passes in to pay one reward.

Attributes:
    decisionId (string): Shared decision ID, written into the payment memo.
    userXrplAddress (string): Wallet that receives the reward.
    amount (number): Reward in RLUSD, above 0 with at most 2 decimals.
*/
export interface SendPaymentInput {
  decisionId: string;
  userXrplAddress: string;
  amount: number;
}

/** Why a payment did not succeed.

ledger_rejected: the ledger refused it (for example tecPATH_PARTIAL when the
agent wallet is short). Maps to REJECTED_BY_LEDGER.
network_error: the outcome is unknown. Do not retry automatically.
invalid_input: the amount or address was malformed, nothing was sent.
*/
export type PaymentFailureReason = 'ledger_rejected' | 'network_error' | 'invalid_input';

/** Result of a payment. Never thrown, always returned.

On success it carries the transaction hash. On failure it carries a reason,
the ledger result code when there is one, the hash when the transaction
reached the ledger, and a plain-language error message.
*/
export type SendPaymentResult =
  | { ok: true; txHash: string; resultCode: 'tesSUCCESS' }
  | {
      ok: false;
      reason: PaymentFailureReason;
      resultCode?: string;
      txHash?: string;
      error: string;
    };

/** The operations every payment implementation (real or fake) provides. */
export interface PaymentService {
  sendPayment(input: SendPaymentInput): Promise<SendPaymentResult>;
  getRlusdBalance(xrplAddress: string): Promise<number>;
  getPaidToday(xrplAddress: string): Promise<number>;
}
