/**Solana stamp integration, per the hand-off contract agreed with Rudra.

This is a fake stand-in so nobody waits on the real Metaplex Core minting
code. Swap the implementations below for calls into Rudra's module at the
Round 3 integration point; callers of this module do not need to change.
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

export interface Stamp {
  decisionId: string;
  placeId: string;
  assetAddress: string;
}

/** Mint a soulbound stamp for a verified visit. FAKE implementation.

Args:
    input (MintStampInput): The decision, place, and addresses to mint for.

Returns:
    Promise<MintStampResult>: A fake successful mint result.
*/
export async function mintStamp(input: MintStampInput): Promise<MintStampResult> {
  return {
    ok: true,
    assetAddress: `fake-asset-${input.decisionId}`,
    signature: `fake-signature-${input.decisionId}`,
  };
}

/** Check whether a wallet already holds a stamp for a place. FAKE implementation.

Args:
    solanaAddress (string): The wallet to check.
    placeId (string): The place to check.

Returns:
    Promise<boolean>: Always false until the real integration is wired in.
*/
export async function hasStampForPlace(_solanaAddress: string, _placeId: string): Promise<boolean> {
  return false;
}

/** List a wallet's stamps. FAKE implementation.

Args:
    solanaAddress (string): The wallet to list stamps for.

Returns:
    Promise<Stamp[]>: Always empty until the real integration is wired in.
*/
export async function getStamps(_solanaAddress: string): Promise<Stamp[]> {
  return [];
}
