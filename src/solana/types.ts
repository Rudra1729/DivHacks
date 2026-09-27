/**Solana stamp interface consumed by the orchestrator.

MintStampInput, MintStampResult, and the three method signatures come from
the hand-off contract in CONTRIBUTING.md. The Stamp shape is not spelled out
there, so it is a minimal assumption to confirm with the Solana owner.
*/

export interface MintStampInput {
  decisionId: string;
  placeId: string;
  userSolanaAddress: string;
  xrplTxHash: string;
}

export type MintStampResult =
  | { ok: true; assetAddress: string; signature: string }
  | { ok: false; error: string };

/** A stamp held by a wallet. */
export interface Stamp {
  assetAddress: string;
  placeId: string;
  decisionId: string;
  xrplTxHash: string;
}

/** The three functions of the hand-off contract, as an injectable object. */
export interface SolanaStamps {
  mintStamp(input: MintStampInput): Promise<MintStampResult>;
  hasStampForPlace(solanaAddress: string, placeId: string): Promise<boolean>;
  getStamps(solanaAddress: string): Promise<Stamp[]>;
}
