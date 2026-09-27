import request from 'supertest';
import { PLACES } from '../../src/data/places';
import { buildTestApp } from '../testHelpers/buildTestApp';

describe('GET /places', () => {
  it('returns the seeded places list, plus any missions the weekly scout has generated since', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/places');
    expect(response.status).toBe(200);
    // At least the fixed list: the weekly mission scout (src/missions) can only add to it.
    expect(response.body.places.length).toBeGreaterThanOrEqual(PLACES.length);
    const ids = response.body.places.map((place: { id: string }) => place.id);
    expect(ids).toEqual(expect.arrayContaining(PLACES.map((place) => place.id)));
    expect(response.body.places[0]).toHaveProperty('id');
    expect(response.body.places[0]).toHaveProperty('neighborhood');
  });
});
