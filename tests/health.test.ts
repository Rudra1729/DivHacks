import request from 'supertest';
import { buildTestApp } from './testHelpers/buildTestApp';

describe('GET /health', () => {
  it('returns 200 and ok status', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/health');
    expect(response.status).toBe(200);
    expect(response.body.status).toBe('ok');
  });
});
