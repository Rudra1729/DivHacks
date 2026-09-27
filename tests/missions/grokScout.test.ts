import { Place } from '../../src/data/places';
import { filterCandidates, GrokMissionScout, parseCandidates } from '../../src/missions/grokScout';
import { MissionCandidate } from '../../src/missions/types';

const APOLLO: Place = {
  id: 'apollo-theater',
  name: 'Apollo Theater',
  kind: 'cultural',
  neighborhood: 'Harlem',
  latitude: 40.8102,
  longitude: -73.95,
  geofenceRadiusMeters: 150,
  baseRewardRlusd: 1,
  solanaCollectionAddress: null,
  imageUrl: 'https://example.com/apollo.png',
  sponsor: null,
  photoHint: 'The Apollo Theater marquee.',
};

const candidate = (overrides: Partial<MissionCandidate> = {}): MissionCandidate => ({
  name: 'City Reliquary',
  neighborhood: 'Williamsburg, Brooklyn',
  latitude: 40.7143,
  longitude: -73.9506,
  reason: 'A small volunteer-run museum most visitors never hear about.',
  description: 'A tiny museum of NYC curiosities.',
  baseRewardRlusd: 1,
  ...overrides,
});

describe('parseCandidates', () => {
  it('parses a well-formed JSON array', () => {
    const text = JSON.stringify([candidate()]);
    expect(parseCandidates(text)).toEqual([candidate()]);
  });

  it('strips a markdown code fence', () => {
    const text = '```json\n' + JSON.stringify([candidate()]) + '\n```';
    expect(parseCandidates(text)).toEqual([candidate()]);
  });

  it('returns undefined for invalid JSON', () => {
    expect(parseCandidates('not json')).toBeUndefined();
  });

  it('returns undefined for a JSON object instead of an array', () => {
    expect(parseCandidates(JSON.stringify(candidate()))).toBeUndefined();
  });

  it('drops entries missing a required field and keeps the rest', () => {
    const good = candidate();
    const missingName = { ...candidate(), name: '' };
    const missingCoords = { ...candidate(), latitude: 'not a number' };
    const result = parseCandidates(JSON.stringify([good, missingName, missingCoords]));
    expect(result).toHaveLength(1);
    expect(result?.[0].name).toBe('City Reliquary');
  });

  it('accepts a missing reason and reward, leaving them blank/NaN for filtering to handle', () => {
    const { reason, baseRewardRlusd, ...rest } = candidate();
    const result = parseCandidates(JSON.stringify([rest]));
    expect(result).toHaveLength(1);
    expect(result?.[0].reason).toBe('');
    expect(Number.isNaN(result?.[0].baseRewardRlusd)).toBe(true);
  });
});

describe('filterCandidates', () => {
  it('keeps a candidate that is in NYC and far from existing places', () => {
    const result = filterCandidates([candidate()], [APOLLO], 1);
    expect(result).toHaveLength(1);
  });

  it('drops a candidate outside NYC', () => {
    const result = filterCandidates([candidate({ latitude: 34.0522, longitude: -118.2437 })], [APOLLO], 1);
    expect(result).toHaveLength(0);
  });

  it('drops a candidate too close to an existing place', () => {
    const result = filterCandidates([candidate({ latitude: 40.8103, longitude: -73.9501 })], [APOLLO], 1);
    expect(result).toHaveLength(0);
  });

  it('clamps a reward above the per-task cap', () => {
    const result = filterCandidates([candidate({ baseRewardRlusd: 50 })], [APOLLO], 1);
    expect(result[0].baseRewardRlusd).toBe(5);
  });

  it('uses the default reward when the candidate reward is missing or invalid', () => {
    const result = filterCandidates([candidate({ baseRewardRlusd: NaN })], [APOLLO], 2.5);
    expect(result[0].baseRewardRlusd).toBe(2.5);
  });
});

describe('GrokMissionScout', () => {
  it('uses the fallback pool when no API key is configured', async () => {
    const scout = new GrokMissionScout({ model: 'grok-4', endpoint: 'https://example.com' });
    const result = await scout.scout({ existingPlaces: [APOLLO], count: 1 });
    expect(result).toHaveLength(1);
  });

  it('never returns more than the requested count', async () => {
    const scout = new GrokMissionScout({ model: 'grok-4', endpoint: 'https://example.com' });
    const result = await scout.scout({ existingPlaces: [], count: 2 });
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('uses Grok when a key is configured and its reply is well formed', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify([candidate()]) } }] }),
    });
    const scout = new GrokMissionScout({ apiKey: 'key', model: 'grok-4', endpoint: 'https://example.com', fetchFn: fetchFn as unknown as typeof fetch });
    const result = await scout.scout({ existingPlaces: [APOLLO], count: 1 });
    expect(result).toEqual([candidate()]);
    expect(fetchFn).toHaveBeenCalledTimes(1);
  });

  it('falls back to the built-in pool when Grok errors', async () => {
    const fetchFn = jest.fn().mockRejectedValue(new Error('network down'));
    const scout = new GrokMissionScout({ apiKey: 'key', model: 'grok-4', endpoint: 'https://example.com', fetchFn: fetchFn as unknown as typeof fetch });
    const result = await scout.scout({ existingPlaces: [APOLLO], count: 1 });
    expect(result).toHaveLength(1);
  });

  it('falls back to the built-in pool when every Grok candidate is filtered out', async () => {
    const fetchFn = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ choices: [{ message: { content: JSON.stringify([candidate({ latitude: 51.5, longitude: -0.1 })]) } }] }),
    });
    const scout = new GrokMissionScout({ apiKey: 'key', model: 'grok-4', endpoint: 'https://example.com', fetchFn: fetchFn as unknown as typeof fetch });
    const result = await scout.scout({ existingPlaces: [APOLLO], count: 1 });
    expect(result).toHaveLength(1); // Grok's London suggestion was rejected, so this came from the fallback pool
  });
});
