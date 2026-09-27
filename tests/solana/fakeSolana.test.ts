import { FakeSolana } from '../../src/solana/fakeSolana';

const input = {
  decisionId: 'd1',
  placeId: 'apollo',
  userSolanaAddress: 'solUser',
  xrplTxHash: 'TX1',
};

describe('FakeSolana', () => {
  it('mints a stamp and reads it back', async () => {
    const solana = new FakeSolana();
    const result = await solana.mintStamp(input);

    expect(result.ok).toBe(true);
    expect(await solana.hasStampForPlace('solUser', 'apollo')).toBe(true);
    const stamps = await solana.getStamps('solUser');
    expect(stamps).toHaveLength(1);
    expect(stamps[0]).toMatchObject({ placeId: 'apollo', decisionId: 'd1', xrplTxHash: 'TX1' });
  });

  it('reports no stamp for a place the wallet has not visited', async () => {
    const solana = new FakeSolana();
    await solana.mintStamp(input);

    expect(await solana.hasStampForPlace('solUser', 'other')).toBe(false);
    expect(await solana.hasStampForPlace('someoneElse', 'apollo')).toBe(false);
  });

  it('returns an error result instead of throwing when mints are failing', async () => {
    const solana = new FakeSolana();
    solana.setFailMints(true);

    const result = await solana.mintStamp(input);
    expect(result.ok).toBe(false);
    expect(await solana.getStamps('solUser')).toEqual([]);

    solana.setFailMints(false);
    expect((await solana.mintStamp(input)).ok).toBe(true);
  });
});
