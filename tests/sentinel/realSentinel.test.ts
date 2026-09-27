import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { RealSentinel } from '../../src/sentinel/realSentinel';
import { createPendingClaimForDecision } from '../../src/db/claims';
import { Place, SubmissionInput } from '../../src/orchestrator/types';
import { endOf, realisticTrail } from '../testHelpers/locationTrail';

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

function buildInput(overrides: Partial<SubmissionInput> = {}): SubmissionInput {
  const trail = realisticTrail(PLACE);
  return {
    requestId: 'req-1',
    placeId: PLACE.id,
    photo: Buffer.from(`photo-${Math.random()}`),
    ...endOf(trail),
    locationTrail: trail,
    timestamp: Date.now(),
    xrplAddress: 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
    solanaAddress: '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    ...overrides,
  };
}

describe('RealSentinel', () => {
  let db: Database.Database;
  let sentinel: RealSentinel;

  beforeEach(() => {
    db = openDatabase(':memory:');
    sentinel = new RealSentinel(db);
  });

  it('passes a valid, on-time, unseen, unclaimed submission', async () => {
    const result = await sentinel.verify(buildInput(), PLACE);
    expect(result.ok).toBe(true);
  });

  it('reports every failure together', async () => {
    const input = buildInput({
      latitude: PLACE.latitude + 5,
      timestamp: Date.now() - 60 * 60 * 1000,
    });
    const result = await sentinel.verify(input, PLACE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.length).toBeGreaterThanOrEqual(2);
      expect(result.failures.some((f) => f.startsWith('location:'))).toBe(true);
      expect(result.failures.some((f) => f.startsWith('freshness:'))).toBe(true);
    }
  });

  it('blocks a reused photo', async () => {
    const photo = Buffer.from('shared-bytes');
    const first = await sentinel.verify(buildInput({ photo }), PLACE);
    expect(first.ok).toBe(true);

    const second = await sentinel.verify(buildInput({ photo, requestId: 'req-2' }), PLACE);
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.failures.some((f) => f.startsWith('replay:'))).toBe(true);
    }
  });

  it('blocks a submission when an active claim already exists for the place', async () => {
    createPendingClaimForDecision(
      db,
      'existing-decision',
      PLACE.id,
      'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM'
    );

    const result = await sentinel.verify(buildInput(), PLACE);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures.some((f) => f.startsWith('once per place:'))).toBe(true);
    }
  });
});
