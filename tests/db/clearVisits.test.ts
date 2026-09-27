import { openDatabase } from '../../src/db';
import { clearAllVisits } from '../../src/db/clearVisits';
import { createUser, getUserByEmail } from '../../src/db/users';

describe('clearAllVisits', () => {
  it('deletes every visit but keeps accounts and their wallets', () => {
    const db = openDatabase(':memory:');
    createUser(db, 'tester@example.com', {
      xrplAddress: 'rUser',
      xrplSecretEncrypted: 'enc-xrpl',
      solanaAddress: 'SolUser',
      solanaSecretEncrypted: 'enc-sol',
    });
    db.prepare(
      `INSERT INTO decisions (id, request_id, place_id, xrpl_address, solana_address, status, reasons, stamp_serial, created_at)
       VALUES ('d-1', 'r-1', 'apollo-theater', 'rUser', 'SolUser', 'OK', '[]', 7, datetime('now'))`
    ).run();
    db.prepare(`INSERT INTO claims (decision_id, xrpl_address, solana_address, place_id, status) VALUES ('d-1', 'rUser', 'SolUser', 'apollo-theater', 'paid')`).run();
    db.prepare(`INSERT INTO audit_events (decision_id, layer, passed, message) VALUES ('d-1', 'sentinel', 1, 'ok')`).run();
    db.prepare(`INSERT INTO photo_fingerprints (hash, decision_id) VALUES ('h-1', 'd-1')`).run();
    db.prepare(`INSERT INTO photo_fingerprints (hash, decision_id) VALUES ('h-2', NULL)`).run();
    db.prepare(`INSERT INTO request_ids (request_id) VALUES ('r-1')`).run();

    const cleared = clearAllVisits(db);

    expect(cleared).toMatchObject({ decisions: 1, claims: 1, audit_events: 1, photo_fingerprints: 2, request_ids: 1 });
    for (const table of ['decisions', 'claims', 'audit_events', 'photo_fingerprints', 'request_ids', 'location_history', 'stamp_retries']) {
      expect((db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n).toBe(0);
    }
    const user = getUserByEmail(db, 'tester@example.com')!;
    expect(user.xrplAddress).toBe('rUser');
    expect(user.solanaAddress).toBe('SolUser');
  });
});
