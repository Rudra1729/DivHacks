import request from 'supertest';
import { buildTestApp } from '../testHelpers/buildTestApp';

describe('GET /places', () => {
  it('returns the seeded places list', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/places');
    expect(response.status).toBe(200);
    expect(response.body.places.length).toBe(7);
    expect(response.body.places[0]).toHaveProperty('id');
    expect(response.body.places[0]).toHaveProperty('neighborhood');
  });
});
