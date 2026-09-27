import request from 'supertest';
import Database from 'better-sqlite3';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { openDatabase } from '../../src/db';
import { createDecision, updateDecision } from '../../src/db/decisions';

describe('GET /metadata/:decisionId', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = openDatabase(':memory:');
    app = createApp(loadConfig(), db);
  });

  it('returns 404 for an unknown decision', async () => {
    const response = await request(app).get('/metadata/does-not-exist');
    expect(response.status).toBe(404);
  });

  it('returns stamp metadata for a known decision', async () => {
    createDecision(db, 'dec-1', 'apollo-theater', 'PAID');
    updateDecision(db, 'dec-1', { xrplHash: 'ABC123' });

    const response = await request(app).get('/metadata/dec-1');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      decisionId: 'dec-1',
      place: 'Apollo Theater',
      neighborhood: 'Harlem',
      xrplPaymentHash: 'ABC123',
    });
    expect(response.body.image).toBeTruthy();
  });
});
