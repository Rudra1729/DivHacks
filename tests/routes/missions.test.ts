import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { PLACES } from '../../src/data/places';
import { buildTestApp } from '../testHelpers/buildTestApp';

describe('POST /missions/refresh', () => {
  const originalPath = process.env.GENERATED_MISSIONS_PATH;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'webpass-missions-route-'));
    process.env.GENERATED_MISSIONS_PATH = join(dir, 'generated-missions.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalPath === undefined) delete process.env.GENERATED_MISSIONS_PATH;
    else process.env.GENERATED_MISSIONS_PATH = originalPath;
  });

  it('adds a new mission and returns it, with no Grok key configured (fallback pool)', async () => {
    const { app } = buildTestApp();
    const response = await request(app).post('/missions/refresh').send({});

    expect(response.status).toBe(200);
    expect(response.body.added).toHaveLength(1);
    expect(response.body.added[0]).toHaveProperty('id');
    expect(response.body.added[0]).toHaveProperty('latitude');
    expect(response.body.added[0]).not.toEqual(expect.objectContaining({ id: PLACES[0].id }));
  });

  it('persists the mission, so a later GET /places includes it', async () => {
    const { app } = buildTestApp();
    await request(app).post('/missions/refresh').send({});

    const placesResponse = await request(app).get('/places');
    expect(placesResponse.body.places.length).toBe(PLACES.length + 1);
  });

  it('does not repeat a mission it already added', async () => {
    const { app } = buildTestApp();
    const first = await request(app).post('/missions/refresh').send({});
    const second = await request(app).post('/missions/refresh').send({});

    expect(first.body.added[0].id).not.toBe(second.body.added[0]?.id);
  });

  it('respects a requested count, capped at 3', async () => {
    const { app } = buildTestApp();
    const response = await request(app).post('/missions/refresh').send({ count: 10 });

    expect(response.body.added.length).toBeLessThanOrEqual(3);
  });

  it('creates the generated missions file the first time it runs', async () => {
    expect(existsSync(process.env.GENERATED_MISSIONS_PATH as string)).toBe(false);
    const { app } = buildTestApp();
    await request(app).post('/missions/refresh').send({});
    expect(existsSync(process.env.GENERATED_MISSIONS_PATH as string)).toBe(true);
  });
});
