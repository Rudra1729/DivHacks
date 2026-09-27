/**Tests for the fake stamp service and the SOLANA_MODE switch.*/

import { fakeStampService } from '../../src/solana/fakeStamps';
import { getStamps, hasStampForPlace, mintStamp } from '../../src/solana';

const input = {
  decisionId: 'dec-1',
  placeId: 'apollo-theater',
  userSolanaAddress: 'user-wallet',
  xrplTxHash: 'XRPL_HASH_1',
};

describe('fake stamps', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv, SOLANA_MODE: 'fake', PLACES_PATH: 'does-not-exist.json' };
    delete process.env.SOLANA_FORCE_FAIL;
    fakeStampService.reset();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('mints a stamp and reads it back with the decision ID', async () => {
    const result = await mintStamp(input);
    expect(result.ok).toBe(true);

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
});
