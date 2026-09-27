import request from 'supertest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { openDatabase } from '../../src/db';

describe('GET /places', () => {
  it('returns the seeded places list', async () => {
    const app = createApp(loadConfig(), openDatabase(':memory:'));
    const response = await request(app).get('/places');
    expect(response.status).toBe(200);
    expect(response.body.places.length).toBe(6);
    expect(response.body.places[0]).toHaveProperty('id');
    expect(response.body.places[0]).toHaveProperty('neighborhood');
  });
});
