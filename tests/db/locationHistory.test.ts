/**Tests for the location_history table.*/

import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import {
  LocationRecord,
  countOtherWalletsAtPoint,
  getLatestLocation,
  pointKey,
  recordLocation,
} from '../../src/db/locationHistory';

function record(overrides: Partial<LocationRecord> = {}): LocationRecord {
  return {
    placeId: 'apollo-theater',
    xrplAddress: 'rUserA',
    solanaAddress: 'SolUserA',
    latitude: 40.810234,
    longitude: -73.950123,
    recordedAt: 1_000,
    ...overrides,
  };
}

describe('location history', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('rounds points to six decimals for comparison', () => {
    expect(pointKey(40.81023449, -73.95012351)).toBe('40.810234,-73.950124');
  });

  it('returns nothing for a wallet with no history', () => {
    expect(getLatestLocation(db, 'rUserA', 'SolUserA')).toBeUndefined();
  });

  it('returns the most recent location for either wallet', () => {
    recordLocation(db, record({ recordedAt: 1_000, placeId: 'first' }));
    recordLocation(db, record({ recordedAt: 2_000, placeId: 'second', xrplAddress: 'rOther' }));
    recordLocation(db, record({ recordedAt: 3_000, placeId: 'someone-else', xrplAddress: 'rB', solanaAddress: 'SolB' }));

    expect(getLatestLocation(db, 'rUserA', 'SolUserA')?.placeId).toBe('second');
  });

  it('counts other wallets at the exact same point since a time', () => {
    recordLocation(db, record({ xrplAddress: 'rB', solanaAddress: 'SolB', recordedAt: 5_000 }));
    recordLocation(db, record({ xrplAddress: 'rC', solanaAddress: 'SolC', recordedAt: 6_000 }));
    recordLocation(db, record({ xrplAddress: 'rC', solanaAddress: 'SolC', recordedAt: 7_000 }));
    recordLocation(db, record({ xrplAddress: 'rOld', solanaAddress: 'SolOld', recordedAt: 100 }));
    recordLocation(db, record({ xrplAddress: 'rFar', solanaAddress: 'SolFar', latitude: 40.8103, recordedAt: 6_000 }));
    recordLocation(db, record({ recordedAt: 6_000 }));

    expect(countOtherWalletsAtPoint(db, 40.810234, -73.950123, 1_000, 'rUserA', 'SolUserA')).toBe(2);
  });
});
