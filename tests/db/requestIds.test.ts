import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { isRequestSeen, recordRequestId } from '../../src/db/requestIds';

describe('request_ids table', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('reports a new request ID as unseen, then seen after recording', () => {
    expect(isRequestSeen(db, 'req-1')).toBe(false);
    recordRequestId(db, 'req-1');
    expect(isRequestSeen(db, 'req-1')).toBe(true);
  });
});
