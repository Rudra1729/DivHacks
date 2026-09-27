import request from 'supertest';
import { Express } from 'express';
import { PayoutAgent } from '../../src/agent/types';
import { Sentinel } from '../../src/sentinel/types';
import { buildTestApp } from '../testHelpers/buildTestApp';

const WALLET_X = 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe';
const WALLET_S = '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM';

function submit(app: Express) {
  return request(app)
    .post('/submissions')
    .field('placeId', 'apollo-theater')
    .field('latitude', '40.8102')
    .field('longitude', '-73.95')
    .field('timestamp', new Date().toISOString())
    .field('xrplAddress', WALLET_X)
    .field('solanaAddress', WALLET_S)
    .attach('photo', Buffer.from(`photo-${Math.random()}`), { filename: 'p.jpg', contentType: 'image/jpeg' });
}

describe('unexpected errors in the API', () => {
  let logged: jest.SpyInstance;

  beforeEach(() => {
    logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => logged.mockRestore());

  it('answers 500 with a safe message instead of hanging when a step throws', async () => {
    const sentinel: Sentinel = { verify: jest.fn().mockRejectedValue(new Error('secret database detail')) };
    const { app } = buildTestApp({}, { sentinel });

    const response = await submit(app);

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain('secret database detail');
  });

  it('records the real error in the server log, so it can be found later', async () => {
    const sentinel: Sentinel = { verify: jest.fn().mockRejectedValue(new Error('secret database detail')) };
    const { app } = buildTestApp({}, { sentinel });

    await submit(app);

    const loggedErrors = logged.mock.calls.flat().filter((arg: unknown) => arg instanceof Error);
    expect(loggedErrors.map((e: Error) => e.message)).toContain('secret database detail');
    expect(logged.mock.calls[0][0]).toContain('POST /submissions');
  });

  it('keeps serving requests after one fails', async () => {
    const sentinel: Sentinel = {
      verify: jest.fn().mockRejectedValueOnce(new Error('one-off failure')).mockResolvedValue({ ok: true }),
    };
    const { app } = buildTestApp({}, { sentinel });

    const failed = await submit(app);
    const health = await request(app).get('/health');
    const next = await submit(app);

    expect(failed.status).toBe(500);
    expect(health.status).toBe(200);
    expect(next.status).toBe(202);
    expect(next.body.status).toBe('OK');
  });

  it('does not lock the visitor out: after a failed attempt the same wallet can try the same place again', async () => {
    const agent: PayoutAgent = {
      propose: jest
        .fn()
        .mockRejectedValueOnce(new Error('agent exploded'))
        .mockResolvedValue({ amount: 1, recipient: WALLET_X, reason: 'retry' }),
    };
    const { app } = buildTestApp({}, { agent });

    const failed = await submit(app);
    const retry = await submit(app);

    expect(failed.status).toBe(500);
    expect(retry.status).toBe(202);
    expect(retry.body.status).toBe('OK');
  });

  it('answers 400 for a request that is malformed JSON, not 500', async () => {
    const { app } = buildTestApp();

    const response = await request(app).post('/health').set('Content-Type', 'application/json').send('{not json');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('bad request');
  });

  it('still answers 400 for an oversized photo, as before', async () => {
    const { app } = buildTestApp();

    const response = await request(app)
      .post('/submissions')
      .field('placeId', 'apollo-theater')
      .field('latitude', '40.8102')
      .field('longitude', '-73.95')
      .field('timestamp', new Date().toISOString())
      .field('xrplAddress', WALLET_X)
      .field('solanaAddress', WALLET_S)
      .attach('photo', Buffer.alloc(6 * 1024 * 1024, 1), { filename: 'big.jpg', contentType: 'image/jpeg' });

    expect(response.status).toBe(400);
    expect(JSON.stringify(response.body)).toContain('upload error');
  });
});
