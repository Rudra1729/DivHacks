/**Shared types for the Solana stamps module.

These types are the hand-off contract agreed in CONTRIBUTING.md section 6.
The orchestrator, Sentinel, and API use them through src/solana/index.ts.
*/

import { StampTier } from './rarity';

export type { StampTier } from './rarity';

/** Everything the orchestrator passes in to mint one stamp.

Attributes:
    decisionId (string): Shared decision ID, also the SQLite key and XRPL memo.
    placeId (string): ID of the place in the shared places file.
    userSolanaAddress (string): Wallet that receives the stamp.
    xrplTxHash (string): Hash of the RLUSD payment for this decision. Empty
        for a stamp-only cultural visit, which pays nothing.
*/
export interface MintStampInput {
  decisionId: string;
  placeId: string;
  userSolanaAddress: string;
  xrplTxHash: string;
}

/** Result of a mint. Never thrown, always returned.

On success it carries the new asset address, transaction signature, and the
stamp's serial and rarity tier for its place. On failure (after one retry)
it carries a plain-language error message.
*/
export type MintStampResult =
  | { ok: true; assetAddress: string; signature: string; serial: number; tier: StampTier }
  | { ok: false; error: string };

/** A passport stamp as read back from Solana.

Attributes:
    assetAddress (string): Metaplex Core asset address.
    owner (string): Wallet that holds the stamp.
    collection (string): Neighborhood collection address.
    name (string): On-chain asset name.
    uri (string): Metadata URL hosted by the API server.
    placeId (string): Place the stamp was earned at.
    neighborhood (string): Neighborhood of the place.
    decisionId (string): Decision that minted this stamp.
    xrplTxHash (string): RLUSD payment hash for the same decision.
    serial (number | null): Position among stamps for this place, from 1.
        Null for stamps minted before rarity existed.
    tier (StampTier | null): Rarity tier picked by the serial. Null for
        stamps minted before rarity existed.
*/
export interface Stamp {
  assetAddress: string;
  owner: string;
  collection: string;
  name: string;
  uri: string;
  placeId: string;
  neighborhood: string;
  decisionId: string;
  xrplTxHash: string;
  serial: number | null;
  tier: StampTier | null;
}

/** The three operations every stamp implementation (real or fake) provides. */
export interface StampService {
  mintStamp(input: MintStampInput): Promise<MintStampResult>;
  hasStampForPlace(solanaAddress: string, placeId: string): Promise<boolean>;
  getStamps(solanaAddress: string): Promise<Stamp[]>;
}
