import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { checkReplay, hashPhoto } from '../../src/sentinel/replay';
import { recordPhotoHash } from '../../src/db/photoFingerprints';

describe('checkReplay', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('passes for a photo not seen before', () => {
    const result = checkReplay(db, Buffer.from('new-photo'));
    expect(result.passed).toBe(true);
    expect(result.hash).toBe(hashPhoto(Buffer.from('new-photo')));
  });

  it('fails for a photo already recorded', () => {
    const buffer = Buffer.from('seen-photo');
    recordPhotoHash(db, hashPhoto(buffer));
    const result = checkReplay(db, buffer);
    expect(result.passed).toBe(false);
  });
});
