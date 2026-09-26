import request from 'supertest';
import { createApp } from '../src/app';
import { loadConfig } from '../src/config';

describe('GET /health', () => {
  it('returns 200 and ok status', async () => {
    const app = createApp(loadConfig());
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
