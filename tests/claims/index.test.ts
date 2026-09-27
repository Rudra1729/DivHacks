import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { checkOncePerPlace, markClaimPending } from '../../src/claims';

describe('checkOncePerPlace', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('passes when no claim exists', () => {
    const result = checkOncePerPlace(db, 'place-1', 'rXRPL', 'sSolana');
    expect(result.passed).toBe(true);
  });

  it('fails after a pending claim is marked, matched on either wallet', () => {
    markClaimPending(db, 'place-1', 'rXRPL', 'sSolana');

    expect(checkOncePerPlace(db, 'place-1', 'rXRPL', 'sOtherSolana').passed).toBe(false);
    expect(checkOncePerPlace(db, 'place-1', 'rOtherXRPL', 'sSolana').passed).toBe(false);
    expect(checkOncePerPlace(db, 'place-2', 'rXRPL', 'sSolana').passed).toBe(true);
  });
});
