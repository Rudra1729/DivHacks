import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { createPendingClaim, findActiveClaim, updateClaimStatus } from '../../src/db/claims';

describe('claims table', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('finds no active claim before one exists', () => {
    expect(findActiveClaim(db, 'place-1', 'rXRPL', 'sSolana')).toBeUndefined();
  });

  it('blocks a second claim for the same place on either wallet', () => {
    createPendingClaim(db, 'place-1', 'rXRPL', 'sSolana');

    expect(findActiveClaim(db, 'place-1', 'rXRPL', 'sOtherSolana')).toBeDefined();
    expect(findActiveClaim(db, 'place-1', 'rOtherXRPL', 'sSolana')).toBeDefined();
    expect(findActiveClaim(db, 'place-2', 'rXRPL', 'sSolana')).toBeUndefined();
  });

  it('does not block on a failed claim', () => {
    const claim = createPendingClaim(db, 'place-1', 'rXRPL', 'sSolana');
    updateClaimStatus(db, claim.id, 'failed');
    expect(findActiveClaim(db, 'place-1', 'rXRPL', 'sSolana')).toBeUndefined();
  });
});
