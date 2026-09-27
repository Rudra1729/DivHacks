/**In-memory Solana stamp stand-in.

Follows the hand-off contract so the real module is a drop-in replacement.
*/

import { MintStampInput, MintStampResult, SolanaStamps, Stamp } from './types';

export class FakeSolana implements SolanaStamps {
  private stamps = new Map<string, Stamp[]>();
  private mintCounter = 0;
  private failMints = false;

  /** Make every following mint fail, to exercise the payment-then-mint-failure path.

  Args:
      fail (boolean): True to fail mints, false to succeed again.
  */
  setFailMints(fail: boolean): void {
    this.failMints = fail;
  }

  async mintStamp(input: MintStampInput): Promise<MintStampResult> {
    if (this.failMints) {
      return { ok: false, error: 'fake mint failure' };
    }
    this.mintCounter += 1;
    const assetAddress = `FAKE_ASSET_${this.mintCounter}`;
    const held = this.stamps.get(input.userSolanaAddress) ?? [];
    held.push({
      assetAddress,
      placeId: input.placeId,
      decisionId: input.decisionId,
      xrplTxHash: input.xrplTxHash,
    });
    this.stamps.set(input.userSolanaAddress, held);
    return { ok: true, assetAddress, signature: `FAKE_SIG_${this.mintCounter}` };
  }

  async hasStampForPlace(solanaAddress: string, placeId: string): Promise<boolean> {
    return (this.stamps.get(solanaAddress) ?? []).some((s) => s.placeId === placeId);
  }

  async getStamps(solanaAddress: string): Promise<Stamp[]> {
    return [...(this.stamps.get(solanaAddress) ?? [])];
  }
}
