import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { createPendingClaimForDecision } from '../../src/db/claims';
import { Place, SubmissionInput } from '../../src/orchestrator/types';
import { RealSentinel } from '../../src/sentinel/realSentinel';
import { FakeStampService } from '../../src/solana/fakeStamps';

const PLACE: Place = {
  id: 'apollo-theater',
  name: 'Apollo Theater',
  neighborhood: 'Harlem',
  latitude: 40.8102,
  longitude: -73.95,
  radiusMeters: 150,
  baseReward: 1,
  collectionAddress: 'fake-collection',
  imageUrl: 'https://example.com/apollo.jpg',
};

const XRPL = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const SOLANA = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

function input(overrides: Partial<SubmissionInput> = {}): SubmissionInput {
  return {
    requestId: 'req-1',
    placeId: PLACE.id,
    photo: Buffer.from(`photo-${Math.random()}`),
    latitude: PLACE.latitude,
    longitude: PLACE.longitude,
    timestamp: Date.now(),
    xrplAddress: XRPL,
    solanaAddress: SOLANA,
    ...overrides,
  };
}

describe('RealSentinel with the Solana stamp check', () => {
  let db: Database.Database;
  let stamps: FakeStampService;
  let sentinel: RealSentinel;

  async function holdStamp(): Promise<void> {
    await stamps.mintStamp({ decisionId: 'earlier', placeId: PLACE.id, userSolanaAddress: SOLANA, xrplTxHash: 'TX' });
  }

  beforeEach(() => {
    db = openDatabase(':memory:');
    stamps = new FakeStampService();
    sentinel = new RealSentinel(db, stamps);
  });

  it('passes a wallet that holds no stamp for the place', async () => {
    expect((await sentinel.verify(input(), PLACE)).ok).toBe(true);
  });

  it('blocks a wallet that already holds a stamp, even though this database has no claim', async () => {
    await holdStamp();

    const result = await sentinel.verify(input(), PLACE);

    expect(result).toEqual({
      ok: false,
      failures: ['once per place: this Solana wallet already holds a stamp for this place'],
    });
  });

  it('only blocks the place the stamp is for', async () => {
    await holdStamp();

    const result = await sentinel.verify(input({ placeId: 'studio-museum-harlem' }), { ...PLACE, id: 'studio-museum-harlem' });

    expect(result.ok).toBe(true);
  });

  it('only blocks the wallet that holds the stamp', async () => {
    await holdStamp();

    const result = await sentinel.verify(input({ solanaAddress: '8WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM' }), PLACE);

    expect(result.ok).toBe(true);
  });

  it('reports the stamp together with the other failures', async () => {
    await holdStamp();

    const result = await sentinel.verify(input({ timestamp: Date.now() - 60 * 60 * 1000 }), PLACE);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures).toHaveLength(2);
      expect(result.failures.some((f) => f.startsWith('freshness:'))).toBe(true);
      expect(result.failures.some((f) => f.startsWith('once per place:'))).toBe(true);
    }
  });

  it('does not ask Solana when the local database already blocks the claim', async () => {
    createPendingClaimForDecision(db, 'dec-1', PLACE.id, XRPL, SOLANA);
    const spy = jest.spyOn(stamps, 'hasStampForPlace');

    const result = await sentinel.verify(input(), PLACE);

    expect(result.ok).toBe(false);
    expect(spy).not.toHaveBeenCalled();
    if (!result.ok) {
      expect(result.failures).toHaveLength(1);
    }
  });

  it('asks Solana about the submitting wallet and place', async () => {
    const spy = jest.spyOn(stamps, 'hasStampForPlace');

    await sentinel.verify(input(), PLACE);

    expect(spy).toHaveBeenCalledWith(SOLANA, PLACE.id);
  });

  it('blocks for now, rather than risk a second payment, when Solana cannot be read', async () => {
    jest.spyOn(stamps, 'hasStampForPlace').mockRejectedValue(new Error('rpc timeout'));

    const result = await sentinel.verify(input(), PLACE);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures[0]).toContain("could not check this wallet's stamps on Solana");
      expect(result.failures[0]).toContain('rpc timeout');
    }
  });

  it('lets the same photo be retried after a stamp block, since it was not recorded as seen', async () => {
    await holdStamp();
    const photo = Buffer.from('retry-photo');
    expect((await sentinel.verify(input({ photo }), PLACE)).ok).toBe(false);

    stamps.reset();

    expect((await sentinel.verify(input({ photo }), PLACE)).ok).toBe(true);
  });

  it('still works without a stamp service, as before', async () => {
    const plain = new RealSentinel(db);
    await holdStamp();

    expect((await plain.verify(input(), PLACE)).ok).toBe(true);
  });
});
