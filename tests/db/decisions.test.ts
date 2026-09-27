import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { createDecision, getDecision, updateDecision } from '../../src/db/decisions';

describe('decisions table', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('creates and reads a decision', () => {
    createDecision(db, 'dec-1', 'PENDING');
    const decision = getDecision(db, 'dec-1');
    expect(decision?.status).toBe('PENDING');
    expect(decision?.reasons).toEqual([]);
    expect(decision?.stampFailed).toBe(false);
  });

  it('updates mutable fields', () => {
    createDecision(db, 'dec-2', 'PENDING');
    updateDecision(db, 'dec-2', { status: 'PAID', xrplHash: 'ABC123' });
    const decision = getDecision(db, 'dec-2');
    expect(decision?.status).toBe('PAID');
    expect(decision?.xrplHash).toBe('ABC123');
  });

  it('returns undefined for a missing decision', () => {
    expect(getDecision(db, 'missing')).toBeUndefined();
  });
});
