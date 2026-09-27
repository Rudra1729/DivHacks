/**Tests for the fake stamp service and the SOLANA_MODE switch.*/

import { FakeStampService, fakeStampService } from '../../src/solana/fakeStamps';
import { getStamps, hasStampForPlace, mintStamp, solanaStamps } from '../../src/solana';

const input = {
  decisionId: 'dec-1',
  placeId: 'apollo-theater',
  userSolanaAddress: 'user-wallet',
  xrplTxHash: 'XRPL_HASH_1',
};

describe('fake stamps', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, SOLANA_MODE: 'fake' };
    delete process.env.SOLANA_FORCE_FAIL;
    fakeStampService.reset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('mints a stamp and reads it back with the decision ID', async () => {
    const result = await mintStamp(input);
    expect(result).toMatchObject({ ok: true, serial: 1, tier: 'Legendary' });

    const stamps = await getStamps('user-wallet');
    expect(stamps).toHaveLength(1);
    expect(stamps[0]).toMatchObject({ placeId: 'apollo-theater', decisionId: 'dec-1', xrplTxHash: 'XRPL_HASH_1' });
  });

  it('answers the already-has-stamp check per wallet and place', async () => {
    await mintStamp(input);
    expect(await hasStampForPlace('user-wallet', 'apollo-theater')).toBe(true);
    expect(await hasStampForPlace('user-wallet', 'other-place')).toBe(false);
    expect(await hasStampForPlace('other-wallet', 'apollo-theater')).toBe(false);
  });

  it('returns an error instead of throwing when SOLANA_FORCE_FAIL is set', async () => {
    process.env.SOLANA_FORCE_FAIL = 'true';
    const result = await mintStamp(input);
    expect(result).toEqual({ ok: false, error: expect.stringContaining('forced') });
    expect(await getStamps('user-wallet')).toHaveLength(0);
  });

  it('fails mints on demand with setFailMints and recovers', async () => {
    const solana = new FakeStampService();
    solana.setFailMints(true);
    expect((await solana.mintStamp(input)).ok).toBe(false);
    expect(await solana.getStamps('user-wallet')).toEqual([]);

    solana.setFailMints(false);
    expect((await solana.mintStamp(input)).ok).toBe(true);
  });

  it('numbers stamps per place so the first finder gets serial 1 and the Legendary tier', async () => {
    await mintStamp(input);
    await mintStamp({ ...input, decisionId: 'dec-2', userSolanaAddress: 'second-wallet' });
    await mintStamp({ ...input, decisionId: 'dec-3', placeId: 'other-place' });

    expect((await getStamps('user-wallet')).map((stamp) => [stamp.placeId, stamp.serial, stamp.tier])).toEqual([
      ['apollo-theater', 1, 'Legendary'],
      ['other-place', 1, 'Legendary'],
    ]);
    expect(await getStamps('second-wallet')).toEqual([
      expect.objectContaining({ placeId: 'apollo-theater', serial: 2, tier: 'Legendary' }),
    ]);
  });

  it('does not use up a serial when a mint fails', async () => {
    const solana = new FakeStampService();
    solana.setFailMints(true);
    await solana.mintStamp(input);
    solana.setFailMints(false);
    await solana.mintStamp(input);

    expect((await solana.getStamps('user-wallet'))[0].serial).toBe(1);
  });

  it('moves to the Epic tier after the tenth stamp for a place', async () => {
    for (let i = 1; i <= 11; i++) {
      await mintStamp({ ...input, decisionId: `dec-${i}`, userSolanaAddress: `wallet-${i}` });
    }

    expect((await getStamps('wallet-10'))[0]).toMatchObject({ serial: 10, tier: 'Legendary' });
    expect((await getStamps('wallet-11'))[0]).toMatchObject({ serial: 11, tier: 'Epic' });
  });

  it('restores stamps minted before a restart and continues their serials', async () => {
    fakeStampService.restore([
      { decisionId: 'old-1', placeId: 'apollo-theater', owner: 'user-wallet', assetAddress: 'fake-asset-4', xrplTxHash: 'H1', serial: 1, tier: 'Legendary' },
      { decisionId: 'old-2', placeId: 'mudd-building', owner: 'user-wallet', assetAddress: 'fake-asset-5', xrplTxHash: '', serial: 1, tier: 'Legendary' },
    ]);

    const restored = await getStamps('user-wallet');
    expect(restored.map((s) => [s.decisionId, s.placeId, s.serial, s.tier])).toEqual([
      ['old-1', 'apollo-theater', 1, 'Legendary'],
      ['old-2', 'mudd-building', 1, 'Legendary'],
    ]);
    expect(await hasStampForPlace('user-wallet', 'mudd-building')).toBe(true);

    const next = await mintStamp({ ...input, decisionId: 'new-1', userSolanaAddress: 'other-wallet' });
    expect(next).toMatchObject({ ok: true, serial: 2, assetAddress: 'fake-asset-6' });
  });

  it('does not duplicate a stamp restored twice', async () => {
    const record = { decisionId: 'old-1', placeId: 'apollo-theater', owner: 'user-wallet', assetAddress: 'fake-asset-1', xrplTxHash: '', serial: 1, tier: 'Legendary' };
    fakeStampService.restore([record]);
    fakeStampService.restore([record]);
    expect(await getStamps('user-wallet')).toHaveLength(1);
  });

  it('exposes the same functions as an injectable solanaStamps object', async () => {
    expect((await solanaStamps.mintStamp(input)).ok).toBe(true);
    expect(await solanaStamps.hasStampForPlace('user-wallet', 'apollo-theater')).toBe(true);
    expect(await solanaStamps.getStamps('user-wallet')).toHaveLength(1);
  });
});
