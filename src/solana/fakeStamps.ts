/**In-memory stamp service with the same API as the real one.

Used while SOLANA_MODE=fake so the orchestrator and Sentinel can integrate
before devnet minting is ready. Stamps are kept in memory; the server
restores them from the decisions table on start so a restart does not
empty everyone's passport.
*/

import { loadSolanaConfig } from './config';
import { findPlace } from './places';
import { tierForSerial } from './rarity';
import { MintStampInput, MintStampResult, Stamp, StampService, StampTier } from './types';

/** A stamp minted before a restart, as the decisions table recorded it. */
export interface RestoredStamp {
  decisionId: string;
  placeId: string;
  owner: string;
  assetAddress: string;
  xrplTxHash: string;
  serial: number | null;
  tier: string | null;
}

/** Fake stamp service that stores stamps in a Map keyed by owner.

Attributes:
    stampsByOwner (Map<string, Stamp[]>): Minted stamps per wallet.
    stampsPerPlace (Map<string, number>): Stamps minted per place, used for serials.
    mintCount (number): Number of successful fake mints, used for fake IDs.
    failMints (boolean): When true, every mint fails.
*/
export class FakeStampService implements StampService {
  private stampsByOwner = new Map<string, Stamp[]>();
  private stampsPerPlace = new Map<string, number>();
  private mintCount = 0;
  private failMints = false;

  /** Make every following mint fail, to exercise the payment-then-mint-failure path.

  Args:
      fail (boolean): True to fail mints, false to succeed again.
  */
  setFailMints(fail: boolean): void {
    this.failMints = fail;
  }

  /** Record a fake stamp for the user.

  Fails when setFailMints(true) was called or SOLANA_FORCE_FAIL is set, so the
  Solana-failure test also works in fake mode.

  Args:
      input (MintStampInput): Decision, place, wallet, and XRPL hash.

  Returns:
      Promise<MintStampResult>: A fake asset address, signature, serial, and
          tier, or an error.
  */
  async mintStamp(input: MintStampInput): Promise<MintStampResult> {
    const config = loadSolanaConfig();
    if (this.failMints || config.forceFail) {
      return { ok: false, error: 'forced mint failure' };
    }

    this.mintCount += 1;
    const serial = (this.stampsPerPlace.get(input.placeId) ?? 0) + 1;
    this.stampsPerPlace.set(input.placeId, serial);
    const tier = tierForSerial(serial);
    const assetAddress = `fake-asset-${this.mintCount}`;
    const place = findPlace(input.placeId);
    const stamp: Stamp = {
      assetAddress,
      owner: input.userSolanaAddress,
      collection: 'fake-collection',
      name: place?.name ?? input.placeId,
      uri: `${config.metadataBaseUrl}/${input.decisionId}`,
      placeId: input.placeId,
      neighborhood: place?.neighborhood ?? 'unknown',
      decisionId: input.decisionId,
      xrplTxHash: input.xrplTxHash,
      serial,
      tier,
    };

    const owned = this.stampsByOwner.get(input.userSolanaAddress) ?? [];
    this.stampsByOwner.set(input.userSolanaAddress, [...owned, stamp]);
    return { ok: true, assetAddress, signature: `fake-signature-${this.mintCount}`, serial, tier };
  }

  /** Check whether a wallet holds a fake stamp for a place.

  Args:
      solanaAddress (string): Wallet to check.
      placeId (string): Place to look for.

  Returns:
      Promise<boolean>: True if the wallet already has a stamp for the place.
  */
  async hasStampForPlace(solanaAddress: string, placeId: string): Promise<boolean> {
    const stamps = await this.getStamps(solanaAddress);
    return stamps.some((stamp) => stamp.placeId === placeId);
  }

  /** List the fake stamps held by a wallet.

  Args:
      solanaAddress (string): Wallet to read.

  Returns:
      Promise<Stamp[]>: Stamps in mint order, empty if none.
  */
  async getStamps(solanaAddress: string): Promise<Stamp[]> {
    return [...(this.stampsByOwner.get(solanaAddress) ?? [])];
  }

  /** Load stamps minted before a restart, so owners keep them and serials continue.

  Args:
      records (RestoredStamp[]): Previously minted stamps, oldest first.
  */
  restore(records: RestoredStamp[]): void {
    const config = loadSolanaConfig();
    for (const record of records) {
      const place = findPlace(record.placeId);
      const stamp: Stamp = {
        assetAddress: record.assetAddress,
        owner: record.owner,
        collection: 'fake-collection',
        name: place?.name ?? record.placeId,
        uri: `${config.metadataBaseUrl}/${record.decisionId}`,
        placeId: record.placeId,
        neighborhood: place?.neighborhood ?? 'unknown',
        decisionId: record.decisionId,
        xrplTxHash: record.xrplTxHash,
        serial: record.serial,
        tier: (record.tier as StampTier | null) ?? (record.serial ? tierForSerial(record.serial) : null),
      };
      const owned = this.stampsByOwner.get(record.owner) ?? [];
      if (owned.some((existing) => existing.decisionId === record.decisionId)) continue;
      this.stampsByOwner.set(record.owner, [...owned, stamp]);

      const placeCount = this.stampsPerPlace.get(record.placeId) ?? 0;
      this.stampsPerPlace.set(record.placeId, Math.max(placeCount, record.serial ?? placeCount + 1));
      const fakeNumber = Number(/^fake-asset-(\d+)$/.exec(record.assetAddress)?.[1] ?? 0);
      this.mintCount = Math.max(this.mintCount + 1, fakeNumber);
    }
  }

  /** Forget every fake stamp and stop failing mints. Used between tests. */
  reset(): void {
    this.stampsByOwner.clear();
    this.stampsPerPlace.clear();
    this.mintCount = 0;
    this.failMints = false;
  }
}

/** Shared fake service used when SOLANA_MODE=fake. */
export const fakeStampService = new FakeStampService();
