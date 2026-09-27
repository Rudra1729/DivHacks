import request from 'supertest';
import { buildTestApp } from '../testHelpers/buildTestApp';

type PlaceBody = { id: string; kind: string; rewardRlusd: number };

async function placesWith(overrides: { rewardScale: number; culturalRewards: boolean }): Promise<PlaceBody[]> {
  const { app } = buildTestApp(overrides);
  const response = await request(app).get('/places');
  return response.body.places;
}

describe('GET /places', () => {
  it('returns the seeded places list', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/places');
    expect(response.status).toBe(200);
    expect(response.body.places.length).toBe(7);
    expect(response.body.places[0]).toHaveProperty('id');
    expect(response.body.places[0]).toHaveProperty('neighborhood');
    expect(response.body.places[0]).toHaveProperty('kind');
  });

  it('reports 0 for cultural places and the scaled reward for civic ones', async () => {
    const places = await placesWith({ rewardScale: 0.01, culturalRewards: false });
    const byId = Object.fromEntries(places.map((p) => [p.id, p.rewardRlusd]));
    expect(byId['apollo-theater']).toBe(0);
    expect(byId['marcus-garvey-park']).toBe(0.01);
  });

  it('reports the scaled reward for cultural places when cultural rewards are on', async () => {
    const places = await placesWith({ rewardScale: 0.1, culturalRewards: true });
    expect(places.every((p) => p.rewardRlusd === 0.1)).toBe(true);
  });
});
