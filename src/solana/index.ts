/**Public API of the Solana stamps module.

Other modules import only from here. SOLANA_MODE picks the implementation
on every call: 'fake' (default) keeps stamps in memory, 'real' mints soulbound
Metaplex Core stamps on devnet.

Example:
    import { mintStamp, hasStampForPlace } from './solana';

    const result = await mintStamp({ decisionId, placeId, userSolanaAddress, xrplTxHash });
    if (!result.ok) queueStampRetry(decisionId, result.error);
*/

import { loadSolanaConfig } from './config';
import { fakeStampService } from './fakeStamps';
import { realStampService } from './stamps';
import { MintStampInput, MintStampResult, Stamp, StampService } from './types';

export type { MintStampInput, MintStampResult, Stamp, StampService } from './types';
export { FakeStampService } from './fakeStamps';

/** Pick the stamp service for the current SOLANA_MODE.

Returns:
    StampService: The real or fake implementation.

Raises:
    SolanaConfigError: If the Solana config is invalid.
*/
function activeService(): StampService {
  return loadSolanaConfig().mode === 'real' ? realStampService : fakeStampService;
}

/** Mint a soulbound stamp into the user's Solana wallet.

Never throws for mint failures. The orchestrator should queue a stamp retry
when ok is false and must not repeat the payment.

Args:
    input (MintStampInput): Decision ID, place ID, user's Solana address, XRPL hash.

Returns:
    Promise<MintStampResult>: Asset address and signature, or an error message.
*/
export function mintStamp(input: MintStampInput): Promise<MintStampResult> {
  return activeService().mintStamp(input);
}

/** Check whether a wallet already holds a stamp for a place.

Args:
    solanaAddress (string): Wallet to check.
    placeId (string): Place to look for.

Returns:
    Promise<boolean>: True if the wallet already has a stamp for the place.
*/
export function hasStampForPlace(solanaAddress: string, placeId: string): Promise<boolean> {
  return activeService().hasStampForPlace(solanaAddress, placeId);
}

/** List the WebPass stamps held by a wallet.

Args:
    solanaAddress (string): Wallet to read.

Returns:
    Promise<Stamp[]>: The wallet's stamps, empty if none.
*/
export function getStamps(solanaAddress: string): Promise<Stamp[]> {
  return activeService().getStamps(solanaAddress);
}
