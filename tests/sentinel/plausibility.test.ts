/**Tests for the location plausibility checks.*/

import { Place } from '../../src/orchestrator/types';
import {
  checkAccuracy,
  checkCluster,
  checkFrozenTrail,
  checkImpossibleTravel,
  checkTrail,
  checkTypedCoordinates,
} from '../../src/sentinel/plausibility';
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

const NOW = 1_800_000_000_000;

describe('checkTrail', () => {
  it('passes a realistic trail that ends at the submitted point', () => {
    const trail = realisticTrail(PLACE, { endAt: NOW - 2_000 });
    expect(checkTrail(trail, endOf(trail), NOW)).toEqual([]);
  });

  it('requires a trail', () => {
    expect(checkTrail(undefined, PLACE, NOW)).toEqual([expect.stringContaining('location trail: missing')]);
  });

  it('requires at least five readings', () => {
    const trail = realisticTrail(PLACE, { samples: 3, endAt: NOW });
    expect(checkTrail(trail, endOf(trail), NOW)).toEqual([expect.stringContaining('only 3 GPS readings')]);
  });

  it('requires the trail to cover at least ten seconds', () => {
    const trail = realisticTrail(PLACE, { spanMs: 4_000, endAt: NOW });
    expect(checkTrail(trail, endOf(trail), NOW)).toEqual([expect.stringContaining('covers 4s')]);
  });

  it('rejects readings out of time order', () => {
    const trail = realisticTrail(PLACE, { endAt: NOW });
    [trail[2], trail[3]] = [trail[3], trail[2]];
    expect(checkTrail(trail, endOf(trail), NOW)).toContain('location trail: readings are out of time order');
  });

  it('rejects a stale trail', () => {
    const trail = realisticTrail(PLACE, { endAt: NOW - 10 * 60_000 });
    expect(checkTrail(trail, endOf(trail), NOW)).toEqual([expect.stringContaining('last GPS reading is 600s old')]);
  });

  it('rejects readings from the future', () => {
    const trail = realisticTrail(PLACE, { endAt: NOW + 5 * 60_000 });
    expect(checkTrail(trail, endOf(trail), NOW)).toEqual(['location trail: readings are from the future']);
  });

  it('rejects a submitted point that is not where the trail ends', () => {
    const trail = realisticTrail(offsetMeters(PLACE, 2_000, 0), { endAt: NOW });
    expect(checkTrail(trail, PLACE, NOW)).toEqual([
      'location trail: submitted location does not match the last GPS reading',
    ]);
  });
});

describe('checkFrozenTrail', () => {
  it('passes a trail that wobbles', () => {
    expect(checkFrozenTrail(realisticTrail(PLACE))).toEqual([]);
  });

  it('flags a trail where every reading is identical, like a browser override', () => {
    const trail = frozenTrail(offsetMeters(PLACE, 20, 13), 150, { spanMs: 18_000 });
    expect(checkFrozenTrail(trail)).toEqual([expect.stringContaining('did not move at all over 18s')]);
  });

  it('passes a still trail whose reported accuracy changes, as a phone on a table does', () => {
    const trail = frozenTrail(offsetMeters(PLACE, 20, 13), 12).map((sample, i) => ({ ...sample, accuracy: 12 + i }));
    expect(checkFrozenTrail(trail)).toEqual([]);
  });
});

describe('checkAccuracy', () => {
  it('passes accuracies a real phone reports', () => {
    expect(checkAccuracy(realisticTrail(PLACE))).toEqual([]);
  });

  it.each([0, 0.5, 1])('flags a reading claiming %pm accuracy', (accuracy) => {
    const trail = realisticTrail(PLACE);
    trail[4].accuracy = accuracy;
    expect(checkAccuracy(trail)).toEqual([expect.stringContaining(`claims ${accuracy}m accuracy`)]);
  });

  it('flags a reading too imprecise to prove presence', () => {
    const trail = realisticTrail(PLACE);
    trail[0].accuracy = 1500;
    expect(checkAccuracy(trail)).toEqual([expect.stringContaining('only accurate to 1500m')]);
  });
});

describe('checkTypedCoordinates', () => {
  it('passes coordinates with real GPS precision away from the pin', () => {
    const trail = realisticTrail(PLACE);
    expect(checkTypedCoordinates(PLACE, endOf(trail), trail)).toEqual([]);
  });

  it('flags coordinates with four or fewer decimal places', () => {
    const typed = { latitude: 40.8104, longitude: -73.9502 };
    expect(checkTypedCoordinates(PLACE, typed, [])).toEqual([
      expect.stringContaining('40.8104, -73.9502 look typed in'),
    ]);
  });

  it('flags a round reading hidden inside the trail', () => {
    const trail = realisticTrail(PLACE);
    trail[3] = { ...trail[3], latitude: 40.81, longitude: -73.9501 };
    expect(checkTypedCoordinates(PLACE, endOf(trail), trail)).toEqual([expect.stringContaining('look typed in')]);
  });

  it("flags coordinates exactly on the place's map pin", () => {
    const onPin = { latitude: 40.810200001, longitude: -73.950000001 };
    expect(checkTypedCoordinates(PLACE, onPin, [])).toEqual([
      expect.stringContaining("exactly on Apollo Theater's map pin"),
    ]);
  });
});

describe('checkImpossibleTravel', () => {
  const previous = {
    placeId: 'apollo-theater',
    xrplAddress: 'rA',
    solanaAddress: 'SolA',
    ...offsetMeters(PLACE, 15, 15),
    recordedAt: NOW - 30_000,
  };

  it('passes a first check-in', () => {
    expect(checkImpossibleTravel(undefined, PLACE, NOW)).toEqual([]);
  });

  it('blocks 5 km in 30 seconds', () => {
    expect(checkImpossibleTravel(previous, offsetMeters(PLACE, 5_000, 0), NOW)).toEqual([
      expect.stringContaining('impossible travel: 5.0 km'),
    ]);
  });

  it('passes 5 km in an hour', () => {
    expect(checkImpossibleTravel({ ...previous, recordedAt: NOW - 60 * 60_000 }, offsetMeters(PLACE, 5_000, 0), NOW)).toEqual([]);
  });

  it('never flags short moves, even quickly', () => {
    expect(checkImpossibleTravel({ ...previous, recordedAt: NOW - 1_000 }, offsetMeters(PLACE, 400, 0), NOW)).toEqual([]);
  });
});

describe('checkCluster', () => {
  it('allows up to one other wallet at the exact same point', () => {
    expect(checkCluster(0)).toEqual([]);
    expect(checkCluster(1)).toEqual([]);
  });

  it('flags a point two other wallets already sent', () => {
    expect(checkCluster(2)).toEqual([expect.stringContaining('cluster: 2 other wallets')]);
  });
});
