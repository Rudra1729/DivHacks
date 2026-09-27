import request from 'supertest';
import { Express } from 'express';
import { buildTestApp } from '../testHelpers/buildTestApp';
import { FakePaymentService } from '../../src/xrpl/fakePayments';
import { endOf, realisticTrail } from '../testHelpers/locationTrail';

function submitApolloTheater(app: Express, overrides: Record<string, string> = {}) {
  const trail = realisticTrail({
    latitude: Number(overrides.latitude ?? '40.8102'),
    longitude: Number(overrides.longitude ?? '-73.95'),
  });
  const { latitude, longitude } = endOf(trail);
  return request(app)
    .post('/submissions')
    .field('placeId', overrides.placeId ?? 'apollo-theater')
    .field('latitude', String(latitude))
    .field('longitude', String(longitude))
    .field('locationTrail', JSON.stringify(trail))
    .field('timestamp', overrides.timestamp ?? new Date().toISOString())
    .field('xrplAddress', overrides.xrplAddress ?? 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')
    .field('solanaAddress', overrides.solanaAddress ?? '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
    .attach('photo', Buffer.from(overrides.photoContent ?? `photo-${Math.random()}`), {
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
    });
}

describe('POST /submissions', () => {
  let app: Express;

  beforeEach(() => {
    ({ app } = buildTestApp());
  });

  it('rejects a submission missing required fields', async () => {
    const response = await request(app).post('/submissions').send({});
    expect(response.status).toBe(400);
    expect(response.body.errors).toContain('photo is required');
  });

  it('accepts a fully valid submission and runs it through the orchestrator', async () => {
    const response = await submitApolloTheater(app);
    expect(response.status).toBe(202);
    expect(response.body.status).toBe('OK');
    expect(response.body.decisionId).toBeTruthy();
    expect(response.body.xrplTxHash).toBeTruthy();
    expect(response.body.solanaAssetAddress).toBeTruthy();
  });

  it('rejects an oversized photo', async () => {
    const response = await request(app)
      .post('/submissions')
      .field('placeId', 'apollo-theater')
      .field('latitude', '40.8102')
      .field('longitude', '-73.95')
      .field('timestamp', new Date().toISOString())
      .field('xrplAddress', 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')
      .field('solanaAddress', '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
      .attach('photo', Buffer.alloc(6 * 1024 * 1024, 1), {
        filename: 'big.jpg',
        contentType: 'image/jpeg',
      });

    expect(response.status).toBe(400);
  });

  it('blocks a submission far from the place with BLOCKED_SENTINEL', async () => {
    const response = await submitApolloTheater(app, { latitude: '40.0', longitude: '-73.0' });
    expect(response.status).toBe(422);
    expect(response.body.status).toBe('BLOCKED_SENTINEL');
    expect(response.body.reasons.some((r: string) => r.startsWith('location:'))).toBe(true);
  });

  it('blocks a stale photo timestamp with BLOCKED_SENTINEL', async () => {
    const oldTimestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const response = await submitApolloTheater(app, { timestamp: oldTimestamp });
    expect(response.status).toBe(422);
    expect(response.body.reasons.some((r: string) => r.startsWith('freshness:'))).toBe(true);
  });

  it('blocks a reused photo on the second submission', async () => {
    const first = await submitApolloTheater(app, { photoContent: 'same-photo-bytes' });
    expect(first.status).toBe(202);

    const second = await submitApolloTheater(app, { photoContent: 'same-photo-bytes' });
    expect(second.status).toBe(422);
    expect(second.body.reasons.some((r: string) => r.startsWith('replay:'))).toBe(true);
  });

  it('reports multiple Sentinel failures together', async () => {
    const oldTimestamp = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const response = await submitApolloTheater(app, {
      latitude: '40.0',
      longitude: '-73.0',
      timestamp: oldTimestamp,
    });
    expect(response.status).toBe(422);
    expect(response.body.reasons.length).toBeGreaterThanOrEqual(2);
  });

  it('blocks a second claim for the same place with a new photo', async () => {
    const first = await submitApolloTheater(app, { photoContent: 'first-visit-photo' });
    expect(first.status).toBe(202);

    const second = await submitApolloTheater(app, { photoContent: 'second-visit-new-photo' });
    expect(second.status).toBe(422);
    expect(second.body.reasons.some((r: string) => r.startsWith('once per place:'))).toBe(true);
  });

  it('does not block a different user claiming the same place', async () => {
    const first = await submitApolloTheater(app, { photoContent: 'user-a-photo' });
    expect(first.status).toBe(202);

    const second = await submitApolloTheater(app, {
      photoContent: 'user-b-photo',
      xrplAddress: 'rQT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe',
      solanaAddress: '8WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
    });
    expect(second.status).toBe(202);
  });

  it('is idempotent for a repeated requestId', async () => {
    const first = await submitApolloTheater(app).field('requestId', 'same-request-id');
    expect(first.status).toBe(202);

    const second = await submitApolloTheater(app, { photoContent: 'different-bytes' }).field(
      'requestId',
      'same-request-id'
    );
    expect(second.status).toBe(202);
    expect(second.body.decisionId).toBe(first.body.decisionId);
  });

  describe('payment outcomes', () => {
    it('returns 202 PAYMENT_UNCONFIRMED when the payment is submitted but not confirmed', async () => {
      const xrpl = new FakePaymentService();
      jest.spyOn(xrpl, 'sendPayment').mockResolvedValue({
        ok: false,
        reason: 'unconfirmed',
        txHash: 'TXU',
        error: 'not validated yet',
      });
      ({ app } = buildTestApp({}, { xrpl, unconfirmedRecheck: { attempts: 0, delayMs: 0 } }));

      const response = await submitApolloTheater(app);

      expect(response.status).toBe(202);
      expect(response.body.status).toBe('PAYMENT_UNCONFIRMED');
      expect(response.body.xrplTxHash).toBe('TXU');
    });

    it('returns 502 PAYMENT_FAILED when nothing was paid because of a network error', async () => {
      const xrpl = new FakePaymentService();
      jest
        .spyOn(xrpl, 'sendPayment')
        .mockResolvedValue({ ok: false, reason: 'network_error', error: 'node unreachable' });
      ({ app } = buildTestApp({}, { xrpl }));

      const response = await submitApolloTheater(app);

      expect(response.status).toBe(502);
      expect(response.body.status).toBe('PAYMENT_FAILED');
    });
  });
});
