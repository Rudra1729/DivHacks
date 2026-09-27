import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

describe('places.ts merges in generated missions', () => {
  const originalPath = process.env.GENERATED_MISSIONS_PATH;
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'webpass-generated-places-'));
    process.env.GENERATED_MISSIONS_PATH = join(dir, 'generated-missions.json');
    jest.resetModules();
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (originalPath === undefined) delete process.env.GENERATED_MISSIONS_PATH;
    else process.env.GENERATED_MISSIONS_PATH = originalPath;
    jest.resetModules();
  });

  it('getAllPlaces returns just the fixed list before any mission has been generated', async () => {
    const { PLACES, getAllPlaces } = await import('../../src/data/places');
    expect(getAllPlaces()).toEqual(PLACES);
  });

  it('a generated mission appears in getAllPlaces and getPlaceById, and PLACES itself is untouched', async () => {
    const { PLACES, getAllPlaces, getPlaceById } = await import('../../src/data/places');
    const { appendGeneratedMissions } = await import('../../src/missions/store');
    const fixedCount = PLACES.length;

    appendGeneratedMissions(
      [
        {
          name: 'City Reliquary',
          neighborhood: 'Williamsburg, Brooklyn',
          latitude: 40.7143,
          longitude: -73.9506,
          reason: 'Overlooked museum',
          description: 'A tiny museum of NYC curiosities.',
          baseRewardRlusd: 1,
        },
      ],
      new Set(PLACES.map((p) => p.id))
    );

    expect(PLACES).toHaveLength(fixedCount); // the fixed list itself never changes

    const all = getAllPlaces();
    expect(all).toHaveLength(fixedCount + 1);
    expect(getPlaceById('city-reliquary')).toMatchObject({ name: 'City Reliquary', baseRewardRlusd: 1 });
    expect(getPlaceById('apollo-theater')).toBeDefined(); // fixed places still resolve
  });
});
