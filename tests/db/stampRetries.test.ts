import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { queueStampRetry, listStampRetries, clearStampRetry } from '../../src/db/stampRetries';

describe('stamp_retries table', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('queues a retry and bumps attempts on repeat failures', () => {
    queueStampRetry(db, 'dec-1', 'mint timed out');
    queueStampRetry(db, 'dec-1', 'mint timed out again');

    const retries = listStampRetries(db);
    expect(retries).toHaveLength(1);
    expect(retries[0].attempts).toBe(2);
    expect(retries[0].lastError).toBe('mint timed out again');
  });

  it('clears a retry once the mint succeeds', () => {
    queueStampRetry(db, 'dec-1', 'mint timed out');
    clearStampRetry(db, 'dec-1');
    expect(listStampRetries(db)).toHaveLength(0);
  });
});
