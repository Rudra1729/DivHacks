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

  it('includes the rarity ladder and supply', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/places');
    expect(response.body.stampSupply).toBe(1000);
    expect(response.body.rarityTiers).toEqual([
      { tier: 'Legendary', fromSerial: 1, toSerial: 10 },
      { tier: 'Epic', fromSerial: 11, toSerial: 100 },
      { tier: 'Rare', fromSerial: 101, toSerial: 400 },
      { tier: 'Common', fromSerial: 401, toSerial: 1000 },
      { tier: 'Late Explorer', fromSerial: 1001, toSerial: null },
    ]);
  });

  it('says the next stamp at an unvisited place is Legendary #1', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/places');
    expect(response.body.places[0].rarity).toEqual({ found: 0, nextSerial: 1, nextTier: 'Legendary' });
  });

  it('moves the next serial and tier on as stamps are found', async () => {
    const { app, db } = buildTestApp();
    const insert = db.prepare(
      `INSERT INTO decisions (id, request_id, place_id, status, reasons, stamp_serial, stamp_tier, created_at)
       VALUES (?, ?, 'apollo-theater', 'OK', '[]', ?, ?, datetime('now'))`
    );
    insert.run('d-10', 'r-10', 10, 'Legendary');

    const response = await request(app).get('/places');
    const apollo = response.body.places.find((p: { id: string }) => p.id === 'apollo-theater');
    expect(apollo.rarity).toEqual({ found: 10, nextSerial: 11, nextTier: 'Epic' });
  });

  it('reports the scaled reward for cultural places when cultural rewards are on', async () => {
    const places = await placesWith({ rewardScale: 0.1, culturalRewards: true });
    expect(places.every((p) => p.rewardRlusd === 0.1)).toBe(true);
  });
});
