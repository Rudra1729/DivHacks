import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { openDatabase } from '../../src/db';
import { createDecision } from '../../src/db/decisions';
import { addAuditEvent } from '../../src/db/auditEvents';

describe('GET /decisions/:id', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = openDatabase(':memory:');
    app = createApp(loadConfig(), db);
  });

  it('returns 404 for an unknown decision', async () => {
    const response = await request(app).get('/decisions/does-not-exist');
    expect(response.status).toBe(404);
  });

  it('returns the decision with its full audit history', async () => {
    createDecision(db, 'dec-1', 'apollo-theater', 'PAID');
    addAuditEvent(db, 'dec-1', 'sentinel', true, 'location ok');
    addAuditEvent(db, 'dec-1', 'policy', true, 'within cap');

    const response = await request(app).get('/decisions/dec-1');
    expect(response.status).toBe(200);
    expect(response.body.decision.id).toBe('dec-1');
    expect(response.body.history).toHaveLength(2);
  });
});
