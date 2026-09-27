import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { createDecision } from '../../src/db/decisions';
import { addAuditEvent, listAuditEvents } from '../../src/db/auditEvents';

describe('audit_events table', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
    createDecision(db, 'dec-1', 'apollo-theater', 'PENDING');
  });

  it('records and lists events in order', () => {
    addAuditEvent(db, 'dec-1', 'sentinel', true, 'location ok');
    addAuditEvent(db, 'dec-1', 'policy', false, 'per-task cap: asked for 50, max is 5');

    const events = listAuditEvents(db, 'dec-1');
    expect(events).toHaveLength(2);
    expect(events[0].message).toBe('location ok');
    expect(events[1].passed).toBe(false);
  });
});
