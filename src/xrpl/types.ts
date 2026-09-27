/**XRPL payment interface consumed by the orchestrator.

These types are the hand-off contract agreed with the XRPL owner in
CONTRIBUTING.md section 6. The real module and the in-memory fake both
provide it.
*/

/** A payment the agent wallet should send. */
export interface SendPaymentInput {
  /** Written into the ledger memo. Also the idempotency key. */
  decisionId: string;
  /** Sent exactly as given. The module never swaps or blocks it. */
  recipient: string;
  /** RLUSD, greater than 0, at most 2 decimals. */
  amount: number;
}

/** Outcome of a payment attempt. Never thrown, always returned.

Failure reasons:
    ledger_rejected: the ledger refused it. Nothing was paid.
    network_error: nothing was paid. Safe to retry.
    unconfirmed: submitted but not confirmed yet, so it may still succeed.
        Do not mark the claim failed. Calling again with the same decision
        ID re-checks the ledger without sending anything new.
    invalid_input: bad amount or address. Nothing was sent.
*/
export type SendPaymentResult =
  | { ok: true; txHash: string; resultCode: 'tesSUCCESS' }
  | {
      ok: false;
      reason: 'ledger_rejected' | 'unconfirmed' | 'network_error' | 'invalid_input';
      resultCode?: string;
      txHash?: string;
      error: string;
    };

/** The four operations every XRPL implementation (real or fake) provides. */
export interface XrplService {
  sendPayment(input: SendPaymentInput): Promise<SendPaymentResult>;
  /** RLUSD balance of an address, read from the ledger. */
  getRlusdBalance(xrplAddress: string): Promise<number>;
  /** RLUSD the agent wallet paid to an address since UTC midnight. */
  getPaidToday(xrplAddress: string): Promise<number>;
  /** Address of the agent wallet. Used by the bypass test. */
  getAgentAddress(): string;
}
