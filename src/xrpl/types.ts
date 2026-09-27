/**XRPL payment interface consumed by the orchestrator.

This shape is an assumption until it is agreed with the XRPL owner in chat.
The real module and the in-memory fake both implement it.
*/

/** A payment the agent wallet should send. */
export interface XrplPaymentInput {
  /** Written into the ledger memo so the payment can be traced back. */
  decisionId: string;
  recipient: string;
  /** Amount of RLUSD. */
  amount: number;
}

/** Ledger outcome. A rejection is returned as a value, never thrown. */
export type XrplPaymentResult =
  | { ok: true; txHash: string }
  | { ok: false; resultCode: string };

export interface XrplClient {
  pay(input: XrplPaymentInput): Promise<XrplPaymentResult>;
  /** RLUSD balance of an address, read from the ledger. */
  getBalance(address: string): Promise<number>;
  /** Total RLUSD the agent wallet paid to an address today, from the ledger. */
  getPaidToday(address: string): Promise<number>;
}
