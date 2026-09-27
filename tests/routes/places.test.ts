import express from 'express';
import request from 'supertest';
import { createPlacesRouter } from '../../src/routes/places';
import { FakePaymentService } from '../../src/xrpl/fakePayments';
import { buildTestApp } from '../testHelpers/buildTestApp';

describe('GET /places', () => {
  it('returns the seeded places list', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/places');
    expect(response.status).toBe(200);
    expect(response.body.places.length).toBe(6);
    expect(response.body.places[0]).toHaveProperty('id');
    expect(response.body.places[0]).toHaveProperty('neighborhood');
  });
});

describe('GET /places payable flag', () => {
  function appWith(xrpl: FakePaymentService, rewardScale?: number, ttlMs?: number) {
    const app = express();
    app.use(createPlacesRouter(xrpl, { rewardScale, ttlMs }));
    return app;
  }

  it('marks every place payable when the agent wallet can back the rewards', async () => {
    const response = await request(appWith(new FakePaymentService())).get('/places');

    expect(response.body.payableCheck).toBe('ok');
    expect(response.body.places).toHaveLength(6);
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
