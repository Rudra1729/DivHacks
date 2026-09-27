import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { runSentinelChecks, BLOCKED_SENTINEL } from '../../src/sentinel';
import { getPlaceById } from '../../src/data/places';

describe('runSentinelChecks', () => {
  let db: Database.Database;
  const place = getPlaceById('apollo-theater')!;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('passes when every check passes', () => {
    const result = runSentinelChecks(db, {
      place,
      latitude: place.latitude,
      longitude: place.longitude,
      timestamp: new Date().toISOString(),
      photoBuffer: Buffer.from('fresh-photo'),
    });
    expect(result.passed).toBe(true);
    expect(result.status).toBe('OK');
  });

  it('reports every failing check together, not just the first', () => {
    const result = runSentinelChecks(db, {
      place,
      latitude: place.latitude + 5,
      longitude: place.longitude + 5,
      timestamp: new Date(Date.now() - 60 * 60 * 1000).toISOString(),
      photoBuffer: Buffer.from('stale-and-far-photo'),
    });
    expect(result.passed).toBe(false);
    expect(result.status).toBe(BLOCKED_SENTINEL);
    const failing = result.checks.filter((check) => !check.passed);
    expect(failing.length).toBe(2);
  });
});
