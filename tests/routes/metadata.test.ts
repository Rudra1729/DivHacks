import request from 'supertest';
import Database from 'better-sqlite3';
import { Express } from 'express';
import { createDecision, updateDecision } from '../../src/db/decisions';
import { buildTestApp } from '../testHelpers/buildTestApp';

describe('GET /metadata/:decisionId', () => {
  let db: Database.Database;
  let app: Express;

  beforeEach(() => {
    ({ app, db } = buildTestApp());
  });

  it('returns 404 for an unknown decision', async () => {
    const response = await request(app).get('/metadata/does-not-exist');
    expect(response.status).toBe(404);
  });

  it('returns stamp metadata for a known decision', async () => {
    createDecision(db, 'dec-1', 'apollo-theater', 'PAID');
    updateDecision(db, 'dec-1', { xrplHash: 'ABC123' });

    const response = await request(app).get('/metadata/dec-1');
    expect(response.status).toBe(200);
    expect(response.body).toMatchObject({
      decisionId: 'dec-1',
      place: 'Apollo Theater',
      neighborhood: 'Harlem',
      xrplPaymentHash: 'ABC123',
    });
    expect(response.body.image).toBeTruthy();
  });

  it('shows the serial, tier, and what is left at the place', async () => {
    createDecision(db, 'dec-1', 'apollo-theater', 'OK');
    updateDecision(db, 'dec-1', { stampSerial: 1, stampTier: 'Legendary' });
    createDecision(db, 'dec-2', 'apollo-theater', 'OK');
    updateDecision(db, 'dec-2', { stampSerial: 2, stampTier: 'Legendary' });

    const response = await request(app).get('/metadata/dec-1');
    expect(response.body).toMatchObject({
      name: 'Apollo Theater #1',
      serial: 1,
      tier: 'Legendary',
      supply: 1000,
      stampsFoundAtPlace: 2,
      remainingAtPlace: 998,
      foundOut: false,
    });
    expect(response.body.attributes).toEqual(
      expect.arrayContaining([
        { trait_type: 'Tier', value: 'Legendary' },
        { trait_type: 'Serial', value: '1 of 1000' },
      ])
    );
  });

  it('marks a place found out once all numbered stamps are taken', async () => {
    createDecision(db, 'dec-late', 'apollo-theater', 'OK');
    updateDecision(db, 'dec-late', { stampSerial: 1001, stampTier: 'Late Explorer' });

    const response = await request(app).get('/metadata/dec-late');
    expect(response.body).toMatchObject({ tier: 'Late Explorer', remainingAtPlace: 0, foundOut: true });
  });

  it('leaves serial and tier empty for stamps minted before rarity', async () => {
    createDecision(db, 'dec-old', 'apollo-theater', 'OK');

    const response = await request(app).get('/metadata/dec-old');
    expect(response.body).toMatchObject({ name: 'Apollo Theater', serial: null, tier: null });
    expect(response.body.attributes).toHaveLength(2);
  });
});
