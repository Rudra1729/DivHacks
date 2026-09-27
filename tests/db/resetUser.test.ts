import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { resetUser } from '../../src/db/resetUser';
import { createUser, getUserByEmail } from '../../src/db/users';

const WALLETS = {
  xrplAddress: 'rUserXrpl',
  xrplSecretEncrypted: 'enc-xrpl',
  solanaAddress: 'OldSolana',
  solanaSecretEncrypted: 'enc-old-solana',
};
const OTHER = {
  xrplAddress: 'rOtherXrpl',
  xrplSecretEncrypted: 'enc-other-xrpl',
  solanaAddress: 'OtherSolana',
  solanaSecretEncrypted: 'enc-other-solana',
};
const NEW_WALLET = { solanaAddress: 'NewSolana', solanaSecretEncrypted: 'enc-new-solana' };

function addVisit(db: Database.Database, decisionId: string, wallets: { xrplAddress: string; solanaAddress: string }): void {
  db.prepare(
    `INSERT INTO decisions (id, request_id, place_id, xrpl_address, solana_address, status, reasons, created_at)
     VALUES (?, ?, 'apollo-theater', ?, ?, 'OK', '[]', datetime('now'))`
  ).run(decisionId, `req-${decisionId}`, wallets.xrplAddress, wallets.solanaAddress);
  db.prepare(
    `INSERT INTO claims (decision_id, xrpl_address, solana_address, place_id, status) VALUES (?, ?, ?, 'apollo-theater', 'paid')`
  ).run(decisionId, wallets.xrplAddress, wallets.solanaAddress);
  db.prepare(`INSERT INTO audit_events (decision_id, layer, passed, message) VALUES (?, 'sentinel', 1, 'ok')`).run(decisionId);
  db.prepare('INSERT INTO photo_fingerprints (hash, decision_id) VALUES (?, ?)').run(`hash-${decisionId}`, decisionId);
  db.prepare(
    `INSERT INTO location_history (place_id, xrpl_address, solana_address, latitude, longitude, point_key, recorded_at)
     VALUES ('apollo-theater', ?, ?, 40.81, -73.95, 'k', 1)`
  ).run(wallets.xrplAddress, wallets.solanaAddress);
}

function count(db: Database.Database, table: string): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('resetUser', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
    createUser(db, 'tester@example.com', WALLETS);
    createUser(db, 'other@example.com', OTHER);
  });

  it("deletes the user's visits and everything recorded for them", () => {
    addVisit(db, 'd-1', WALLETS);
    addVisit(db, 'd-2', WALLETS);

    const summary = resetUser(db, 'tester@example.com', NEW_WALLET);

    expect(summary.deleted).toEqual({
      decisions: 2,
      auditEvents: 2,
      claims: 2,
      stampRetries: 0,
      photoFingerprints: 2,
      locationHistory: 2,
    });
    for (const table of ['decisions', 'claims', 'audit_events', 'photo_fingerprints', 'location_history']) {
      expect(count(db, table)).toBe(0);
    }
  });

  it('moves the user to the new Solana wallet and keeps the XRPL wallet', () => {
    const summary = resetUser(db, 'tester@example.com', NEW_WALLET);

    expect(summary).toMatchObject({ oldSolanaAddress: 'OldSolana', newSolanaAddress: 'NewSolana', xrplAddress: 'rUserXrpl' });
    const user = getUserByEmail(db, 'tester@example.com')!;
    expect(user.solanaAddress).toBe('NewSolana');
    expect(user.solanaSecretEncrypted).toBe('enc-new-solana');
    expect(user.xrplAddress).toBe('rUserXrpl');
    expect(user.xrplSecretEncrypted).toBe('enc-xrpl');
  });

  it("leaves other users' visits alone", () => {
    addVisit(db, 'd-mine', WALLETS);
    addVisit(db, 'd-theirs', OTHER);

    resetUser(db, 'tester@example.com', NEW_WALLET);

    expect(db.prepare('SELECT id FROM decisions').all()).toEqual([{ id: 'd-theirs' }]);
    expect(count(db, 'claims')).toBe(1);
    expect(count(db, 'photo_fingerprints')).toBe(1);
    expect(count(db, 'location_history')).toBe(1);
    expect(getUserByEmail(db, 'other@example.com')!.solanaAddress).toBe('OtherSolana');
  });

  it('clears stamp retries queued for the old wallet', () => {
    addVisit(db, 'd-1', WALLETS);
    db.prepare(`INSERT INTO stamp_retries (decision_id, place_id, solana_address) VALUES ('d-1', 'apollo-theater', 'OldSolana')`).run();

    expect(resetUser(db, 'tester@example.com', NEW_WALLET).deleted.stampRetries).toBe(1);
    expect(count(db, 'stamp_retries')).toBe(0);
  });

  it('throws for an unknown email and changes nothing', () => {
    addVisit(db, 'd-1', WALLETS);
    expect(() => resetUser(db, 'nobody@example.com', NEW_WALLET)).toThrow('no user with email nobody@example.com');
    expect(count(db, 'decisions')).toBe(1);
  });
});
