/**Solana stamp integration, per the hand-off contract agreed with Rudra.

Re-exports Rudra's stamps module (src/solana) so existing callers keep their
import path. SOLANA_MODE picks the implementation: 'fake' (default) keeps
stamps in memory, 'real' mints and reads soulbound stamps on devnet.
*/

export { STAMP_SUPPLY_PER_PLACE, getStamps, hasStampForPlace, isFoundOut, mintStamp } from '../solana';
export type { MintStampInput, MintStampResult, Stamp, StampTier } from '../solana';
