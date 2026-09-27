import request from 'supertest';
import Database from 'better-sqlite3';
import { Express } from 'express';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { openDatabase } from '../../src/db';

function submitApolloTheater(app: Express, overrides: Record<string, string> = {}) {
  return request(app)
    .post('/submissions')
    .field('placeId', overrides.placeId ?? 'apollo-theater')
    .field('latitude', overrides.latitude ?? '40.8102')
    .field('longitude', overrides.longitude ?? '-73.95')
    .field('timestamp', overrides.timestamp ?? new Date().toISOString())
    .field('xrplAddress', overrides.xrplAddress ?? 'rPT1Sjq2YGrBMTttX4GZHjKu9dyfzbpAYe')
    .field('solanaAddress', overrides.solanaAddress ?? '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM')
    .attach('photo', Buffer.from(overrides.photoContent ?? `photo-${Math.random()}`), {
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
    });
}

describe('POST /submissions', () => {
  let db: Database.Database;
  let app: ReturnType<typeof createApp>;

  beforeEach(() => {
    db = openDatabase(':memory:');
    app = createApp(loadConfig(), db);
  });

  it('rejects a submission missing required fields', async () => {
    const response = await request(app).post('/submissions').send({});
    expect(response.status).toBe(400);
    expect(response.body.errors).toContain('photo is required');
  });

  it('accepts a fully valid submission', async () => {
    const response = await submitApolloTheater(app);
    expect(response.status).toBe(202);
    expect(response.body.accepted).toBe(true);
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
});
