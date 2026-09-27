import { existsSync, mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { appendGeneratedMissions, readGeneratedMissions, uniquePlaceId } from '../../src/missions/store';
import { MissionCandidate } from '../../src/missions/types';

const candidate = (overrides: Partial<MissionCandidate> = {}): MissionCandidate => ({
  name: 'City Reliquary',
  neighborhood: 'Williamsburg, Brooklyn',
  latitude: 40.7143,
  longitude: -73.9506,
  reason: 'A small volunteer-run museum.',
  description: 'A tiny museum of NYC curiosities.',
  baseRewardRlusd: 1,
  ...overrides,
});

describe('uniquePlaceId', () => {
  it('slugifies the name', () => {
    expect(uniquePlaceId('City Reliquary', new Set())).toBe('city-reliquary');
  });

  it('adds a numeric suffix on collision', () => {
    const existing = new Set(['city-reliquary']);
    expect(uniquePlaceId('City Reliquary', existing)).toBe('city-reliquary-2');
  });

  it('keeps incrementing past multiple collisions', () => {
    const existing = new Set(['city-reliquary', 'city-reliquary-2', 'city-reliquary-3']);
    expect(uniquePlaceId('City Reliquary', existing)).toBe('city-reliquary-4');
  });
});

describe('generated missions store', () => {
  let dir: string;
  let path: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'webpass-missions-'));
    path = join(dir, 'generated-missions.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('returns [] when the file does not exist yet', () => {
    expect(readGeneratedMissions(path)).toEqual([]);
    expect(existsSync(path)).toBe(false);
  });

  it('appends a candidate, assigns it an ID, and persists it', () => {
    const added = appendGeneratedMissions([candidate()], new Set(['apollo-theater']), path);

    expect(added).toHaveLength(1);
    expect(added[0]).toMatchObject({
      id: 'city-reliquary',
      name: 'City Reliquary',
      geofenceRadiusMeters: 150,
      baseRewardRlusd: 1,
      solanaCollectionAddress: null,
    });
    expect(readGeneratedMissions(path)).toEqual(added);
  });

  it('appends on top of what is already stored, without overwriting it', () => {
    appendGeneratedMissions([candidate()], new Set(['apollo-theater']), path);
    appendGeneratedMissions([candidate({ name: 'Wave Hill' })], new Set(['apollo-theater', 'city-reliquary']), path);

    const stored = readGeneratedMissions(path);
    expect(stored.map((m) => m.id)).toEqual(['city-reliquary', 'wave-hill']);
  });

  it('avoids an ID collision across two calls', () => {
    appendGeneratedMissions([candidate()], new Set(), path);
    const second = appendGeneratedMissions([candidate()], new Set(['city-reliquary']), path);

    expect(second[0].id).toBe('city-reliquary-2');
  });
});
