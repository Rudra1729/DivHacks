/**Shared types for the XRPL payments module.

These types are the hand-off contract agreed with the orchestrator owner.
The orchestrator and policy engine use them through src/xrpl/index.ts.
*/

/** Everything the orchestrator passes in to pay one reward.

The recipient is sent to exactly as given. The module only checks that it
is a well-formed address and never swaps or blocks it: deciding who may be
paid is the policy engine's job, and the ledger is the last line of defense.

Attributes:
    decisionId (string): Shared decision ID, written into the payment memo.
        Also the idempotency key: one decision is never paid twice.
    recipient (string): XRPL address that receives the reward.
    amount (number): Reward in RLUSD, above 0 with at most 2 decimals.
*/
export interface SendPaymentInput {
  decisionId: string;
  recipient: string;
  amount: number;
}

/** Why a payment did not succeed.

ledger_rejected: the ledger refused it (for example tecPATH_PARTIAL when the
    agent wallet is short). Nothing was paid. Maps to REJECTED_BY_LEDGER.
unconfirmed: the payment was submitted but not confirmed in time. It may
    still succeed. txHash is set. Calling sendPayment again with the same
    decisionId re-checks the ledger and never sends a second payment.
network_error: nothing was paid (never submitted, or expired unapplied).
    Safe to retry with the same decisionId.
invalid_input: the amount or address was malformed. Nothing was sent.
*/
export type PaymentFailureReason = 'ledger_rejected' | 'unconfirmed' | 'network_error' | 'invalid_input';

/** Result of a payment. Never thrown, always returned.

On success it carries the transaction hash. On failure it carries a reason,
the ledger result code when there is one, the hash whenever the transaction
was submitted, and a plain-language error message.
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
