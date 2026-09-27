import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';
import { openDatabase } from '../src/db';

describe('GET /health', () => {
  it('returns 200 and ok status', async () => {
    const app = createApp(loadConfig(), openDatabase(':memory:'));
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
