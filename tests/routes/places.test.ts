import express from 'express';
import request from 'supertest';
import { PLACES } from '../../src/data/places';
import { openDatabase } from '../../src/db';
import { createPlacesRouter } from '../../src/routes/places';
import { FakePaymentService } from '../../src/xrpl/fakePayments';
import { buildTestApp } from '../testHelpers/buildTestApp';

type PlaceBody = { id: string; kind: string; rewardRlusd: number; sponsor: string | null };

async function placesWith(overrides: { rewardScale: number; culturalRewards: boolean }): Promise<PlaceBody[]> {
  const { app } = buildTestApp(overrides);
  const response = await request(app).get('/places');
  return response.body.places;
}

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
    expect(response.body.places[0]).toHaveProperty('kind');
  });

  it('reports 0 for cultural places and the scaled reward for civic ones', async () => {
    const places = await placesWith({ rewardScale: 0.01, culturalRewards: false });
    const byId = Object.fromEntries(places.map((p) => [p.id, p.rewardRlusd]));
    expect(byId['apollo-theater']).toBe(0);
    expect(byId['marcus-garvey-park']).toBe(0.01);
    expect(byId['mudd-entrance']).toBe(0.01);
  });

  it('names the sponsor of each civic bounty', async () => {
    const places = await placesWith({ rewardScale: 0.01, culturalRewards: false });
    const byId = Object.fromEntries(places.map((p) => [p.id, p.sponsor]));
    expect(byId['mudd-entrance']).toBe('Columbia Engineering');
    expect(byId['apollo-theater']).toBeNull();
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
    const fixedIds = new Set(PLACES.map((place) => place.id));
    const fixed = places.filter((p) => fixedIds.has(p.id));
    expect(fixed).toHaveLength(PLACES.length);
    expect(fixed.every((p) => p.rewardRlusd === 0.1)).toBe(true);
  });
});

describe('GET /places payable flag', () => {
  function appWith(xrpl: FakePaymentService, rewardScale?: number, ttlMs?: number, culturalRewards = true) {
    const app = express();
    app.use(createPlacesRouter(xrpl, openDatabase(':memory:'), { rewardScale, ttlMs, culturalRewards }));
    return app;
  }

  it('marks every place payable when the agent wallet can back the rewards', async () => {
    const response = await request(appWith(new FakePaymentService())).get('/places');

    expect(response.body.payableCheck).toBe('ok');
    expect(response.body.places.length).toBeGreaterThanOrEqual(PLACES.length);
    expect(response.body.places.every((p: { payable: boolean }) => p.payable === true)).toBe(true);
  });

  it('keeps the rest of each place unchanged', async () => {
    const response = await request(appWith(new FakePaymentService())).get('/places');

    expect(response.body.places[0]).toMatchObject({ id: 'apollo-theater', name: 'Apollo Theater', baseRewardRlusd: 1 });
  });

  it('marks places not payable when the agent wallet is short', async () => {
    const xrpl = new FakePaymentService();
    await xrpl.sendPayment({ decisionId: 'drain', recipient: 'rSomeoneElse', amount: 9.5 });

    const response = await request(appWith(xrpl)).get('/places');

    expect(response.body.payableCheck).toBe('ok');
    expect(response.body.places.every((p: { payable: boolean }) => p.payable === false)).toBe(true);
  });

  it('keeps stamp-only cultural places payable when the agent wallet is short', async () => {
    const xrpl = new FakePaymentService();
    await xrpl.sendPayment({ decisionId: 'drain', recipient: 'rSomeoneElse', amount: 9.5 });

    const response = await request(appWith(xrpl, 1, undefined, false)).get('/places');
    const payable = Object.fromEntries(
      response.body.places.map((p: { id: string; payable: boolean }) => [p.id, p.payable])
    );

    expect(payable['apollo-theater']).toBe(true);
    expect(payable['mudd-entrance']).toBe(false);
  });

  it('uses the scaled reward, since that is what a visitor would be paid', async () => {
    const xrpl = new FakePaymentService();
    await xrpl.sendPayment({ decisionId: 'drain', recipient: 'rSomeoneElse', amount: 9.95 });

    const response = await request(appWith(xrpl, 0.01)).get('/places');

    expect(response.body.places.every((p: { payable: boolean }) => p.payable === true)).toBe(true);
  });

  it('says nothing is payable, and why, when the ledger cannot be read', async () => {
    const xrpl = new FakePaymentService();
    jest.spyOn(xrpl, 'getRlusdBalance').mockRejectedValue(new Error('down'));

    const response = await request(appWith(xrpl)).get('/places');

    expect(response.status).toBe(200);
    expect(response.body.payableCheck).toBe('ledger_unreadable');
    expect(response.body.places.every((p: { payable: boolean }) => p.payable === false)).toBe(true);
  });

  it('reads the ledger once for many requests inside the cache window', async () => {
    const xrpl = new FakePaymentService();
    const read = jest.spyOn(xrpl, 'getRlusdBalance');
    const app = appWith(xrpl, 1, 60_000);

    await Promise.all([request(app).get('/places'), request(app).get('/places'), request(app).get('/places')]);
    await request(app).get('/places');

    expect(read).toHaveBeenCalledTimes(1);
  });

  it('follows the ledger once the cache window is over', async () => {
    const xrpl = new FakePaymentService();
    const app = appWith(xrpl, 1, 0);

    const before = await request(app).get('/places');
    await xrpl.sendPayment({ decisionId: 'drain', recipient: 'rSomeoneElse', amount: 10 });
    const after = await request(app).get('/places');

    expect(before.body.places[0].payable).toBe(true);
    expect(after.body.places[0].payable).toBe(false);
  });

  it('is what the full app serves, using the app ledger', async () => {
    const xrpl = new FakePaymentService();
    await xrpl.sendPayment({ decisionId: 'drain', recipient: 'rSomeoneElse', amount: 10 });
    const { app } = buildTestApp({}, { xrpl });

    const response = await request(app).get('/places');

    expect(response.body.places[0].payable).toBe(false);
  });
});
