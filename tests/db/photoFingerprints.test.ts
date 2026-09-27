import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { isPhotoHashSeen, recordPhotoHash } from '../../src/db/photoFingerprints';

describe('photo_fingerprints table', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('reports a new hash as unseen, then seen after recording', () => {
    expect(isPhotoHashSeen(db, 'abc123')).toBe(false);
    recordPhotoHash(db, 'abc123');
    expect(isPhotoHashSeen(db, 'abc123')).toBe(true);
  });
});
