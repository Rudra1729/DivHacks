/**Tests for the location plausibility checks inside the real Sentinel.*/

import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { getLatestLocation } from '../../src/db/locationHistory';
import { LocationSample, Place, SubmissionInput } from '../../src/orchestrator/types';
import { RealSentinel } from '../../src/sentinel/realSentinel';
import { endOf, frozenTrail, offsetMeters, realisticTrail } from '../testHelpers/locationTrail';

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

/** A place 5 km north of the Apollo, far enough that reaching it in seconds is impossible. */
const FAR_PLACE: Place = { ...PLACE, id: 'far-place', name: 'Far Place', ...offsetMeters(PLACE, 5_000, 0) };

let walletCounter = 0;

function wallets(): { xrplAddress: string; solanaAddress: string } {
  walletCounter += 1;
  return { xrplAddress: `rWallet${walletCounter}`, solanaAddress: `SolWallet${walletCounter}` };
}

function submission(place: Place, trail: LocationSample[], who = wallets()): SubmissionInput {
  return {
    requestId: `req-${Math.random()}`,
    placeId: place.id,
    photo: Buffer.from(`photo-${Math.random()}`),
    ...endOf(trail),
    locationTrail: trail,
    timestamp: Date.now(),
    ...who,
  };
}

describe('RealSentinel location plausibility', () => {
  let db: Database.Database;
  let clock: number;
  let sentinel: RealSentinel;

  beforeEach(() => {
    db = openDatabase(':memory:');
    clock = Date.now();
    sentinel = new RealSentinel(db, undefined, { now: () => clock });
  });

  it('passes a realistic phone trail and records where the wallet was', async () => {
    const who = wallets();
    const input = submission(PLACE, realisticTrail(PLACE, { endAt: clock }), who);

    expect(await sentinel.verify(input, PLACE)).toEqual({ ok: true });
    expect(getLatestLocation(db, who.xrplAddress, who.solanaAddress)).toMatchObject({
      placeId: PLACE.id,
      latitude: input.latitude,
      recordedAt: clock,
    });
  });

  it('blocks a browser location override: frozen readings on the exact pin', async () => {
    const result = await sentinel.verify(submission(PLACE, frozenTrail(PLACE, 150, { endAt: clock })), PLACE);

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.failures).toEqual(
        expect.arrayContaining([
          expect.stringContaining('location trail: GPS did not move'),
          expect.stringContaining("exactly on Apollo Theater's map pin"),
          expect.stringContaining('look typed in'),
        ])
      );
    }
  });

  it('blocks a submission with no trail', async () => {
    const input = { ...submission(PLACE, realisticTrail(PLACE)), locationTrail: undefined };

    const result = await sentinel.verify(input, PLACE);

    expect(result).toEqual({ ok: false, failures: [expect.stringContaining('location trail: missing')] });
  });

  it('blocks the same wallet at a place 5 km away 30 seconds later', async () => {
    const who = wallets();
    expect((await sentinel.verify(submission(PLACE, realisticTrail(PLACE, { endAt: clock }), who), PLACE)).ok).toBe(true);

    clock += 30_000;
    const result = await sentinel.verify(submission(FAR_PLACE, realisticTrail(FAR_PLACE, { endAt: clock }), who), FAR_PLACE);

    expect(result).toEqual({ ok: false, failures: [expect.stringMatching(/^impossible travel: (4\.9|5\.0|5\.1) km/)] });
  });

  it('matches travel on either wallet, so switching XRPL address does not help', async () => {
    const who = wallets();
    await sentinel.verify(submission(PLACE, realisticTrail(PLACE, { endAt: clock }), who), PLACE);

    clock += 30_000;
    const switched = { ...who, xrplAddress: 'rSomeOtherWallet' };
    const result = await sentinel.verify(submission(FAR_PLACE, realisticTrail(FAR_PLACE, { endAt: clock }), switched), FAR_PLACE);

    expect(result.ok).toBe(false);
  });

  it('lets the same wallet reach the far place after a believable time', async () => {
    const who = wallets();
    await sentinel.verify(submission(PLACE, realisticTrail(PLACE, { endAt: clock }), who), PLACE);

    clock += 30 * 60_000;
    const result = await sentinel.verify(submission(FAR_PLACE, realisticTrail(FAR_PLACE, { endAt: clock }), who), FAR_PLACE);

    expect(result).toEqual({ ok: true });
  });

  it('does not record blocked submissions, so nobody can poison another wallet\'s history', async () => {
    const victim = wallets();
    const spoof = submission(FAR_PLACE, frozenTrail(FAR_PLACE, 150, { endAt: clock }), victim);
    expect((await sentinel.verify(spoof, FAR_PLACE)).ok).toBe(false);

    clock += 30_000;
    const honest = submission(PLACE, realisticTrail(PLACE, { endAt: clock }), victim);
    expect(await sentinel.verify(honest, PLACE)).toEqual({ ok: true });
  });

  it('blocks a third wallet sending exactly the same coordinates', async () => {
    const trail = realisticTrail(PLACE, { endAt: clock });
    expect((await sentinel.verify(submission(PLACE, trail), PLACE)).ok).toBe(true);
    expect((await sentinel.verify(submission(PLACE, trail), PLACE)).ok).toBe(true);

    const result = await sentinel.verify(submission(PLACE, trail), PLACE);

    expect(result).toEqual({ ok: false, failures: [expect.stringContaining('cluster: 2 other wallets')] });
  });

  it('skips every location check when turned off', async () => {
    const off = new RealSentinel(db, undefined, { locationChecks: false, now: () => clock });
    const input = { ...submission(PLACE, frozenTrail(PLACE)), locationTrail: undefined };

    expect(await off.verify(input, PLACE)).toEqual({ ok: true });
  });
});
