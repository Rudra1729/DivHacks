import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { listAuditEvents } from '../../src/db/auditEvents';
import { subscribeToEvents, WebPassEvent } from '../../src/events/bus';
import { SqliteStorage } from '../../src/storage/sqliteStorage';

describe('SqliteStorage audit events', () => {
  let db: Database.Database;
  let storage: SqliteStorage;
  let heard: WebPassEvent[];
  let unsubscribe: () => void;

  beforeEach(async () => {
    db = openDatabase(':memory:');
    storage = new SqliteStorage(db);
    heard = [];
    unsubscribe = subscribeToEvents((event) => heard.push(event));
    await storage.saveDecision('req-1', {
      decisionId: 'dec-1',
      status: 'OK',
      reasons: [],
      stampFailed: false,
    });
  });

  afterEach(() => unsubscribe());

  it('saves each step in order, with passed as a yes or no', async () => {
    await storage.recordAuditEvents('dec-1', [
      { layer: 'sentinel', passed: true, message: 'checks passed' },
      { layer: 'policy', passed: false, message: 'per-task cap: asked for 50, max is 5' },
    ]);

    const saved = listAuditEvents(db, 'dec-1');
    expect(saved.map((e) => [e.layer, e.passed, e.message])).toEqual([
      ['sentinel', true, 'checks passed'],
      ['policy', false, 'per-task cap: asked for 50, max is 5'],
    ]);
    expect(saved[0].createdAt).toBeTruthy();
  });

  it('appends when a decision is resumed, keeping the earlier steps', async () => {
    await storage.recordAuditEvents('dec-1', [{ layer: 'xrpl', passed: false, message: 'not confirmed yet' }]);
    await storage.recordAuditEvents('dec-1', [{ layer: 'xrpl', passed: true, message: 'paid' }]);

    expect(listAuditEvents(db, 'dec-1').map((e) => e.message)).toEqual(['not confirmed yet', 'paid']);
  });

  it('keeps each decision history separate', async () => {
    await storage.saveDecision('req-2', {
      decisionId: 'dec-2',
      status: 'BLOCKED_POLICY',
      reasons: [],
      stampFailed: false,
    });
    await storage.recordAuditEvents('dec-1', [{ layer: 'claim', passed: true, message: 'one' }]);
    await storage.recordAuditEvents('dec-2', [{ layer: 'policy', passed: false, message: 'two' }]);

    expect(listAuditEvents(db, 'dec-1').map((e) => e.message)).toEqual(['one']);
    expect(listAuditEvents(db, 'dec-2').map((e) => e.message)).toEqual(['two']);
  });

  it('announces every step on the live event stream', async () => {
    await storage.recordAuditEvents('dec-1', [
      { layer: 'sentinel', passed: true, message: 'checks passed' },
      { layer: 'xrpl', passed: true, message: 'paid' },
    ]);

    expect(heard.map((e) => [e.type, e.decisionId, e.message])).toEqual([
      ['audit.sentinel', 'dec-1', 'checks passed'],
      ['audit.xrpl', 'dec-1', 'paid'],
    ]);
  });

  it('does nothing for an empty list', async () => {
    await storage.recordAuditEvents('dec-1', []);

    expect(listAuditEvents(db, 'dec-1')).toEqual([]);
    expect(heard).toEqual([]);
  });

  it('saves all steps or none if one fails', async () => {
    const bad = { layer: 'policy', passed: true, message: null as unknown as string };

    // Not .rejects.toThrow(): the database's native error can come from another test
    // file's environment when files share a worker, and jest then does not
    // recognize it as an Error. Checking the message works either way.
    let failure: unknown;
    try {
      await storage.recordAuditEvents('dec-1', [{ layer: 'sentinel', passed: true, message: 'ok' }, bad]);
    } catch (error) {
      failure = error;
    }

    expect((failure as { message?: string } | undefined)?.message).toContain('NOT NULL');
    expect(listAuditEvents(db, 'dec-1')).toEqual([]);
  });
});
