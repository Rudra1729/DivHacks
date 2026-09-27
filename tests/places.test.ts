import { readFileSync } from 'fs';
import path from 'path';
import { Place } from '../src/orchestrator/types';
import { collectionForPlace } from '../src/solana/places';
import { MAX_PER_TASK } from '../src/policy/rules';

const places: Place[] = JSON.parse(
  readFileSync(path.join(__dirname, '..', 'data', 'places.json'), 'utf8')
);

describe('data/places.json', () => {
  it('has the 6 places the PRD calls for', () => {
    expect(places).toHaveLength(6);
  });

  it('gives every place a unique ID', () => {
    const ids = places.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(places.map((p) => [p.id, p] as const))('%s has valid fields', (_id, place) => {
    expect(place.name.length).toBeGreaterThan(0);
    expect(place.imageUrl).toMatch(/^https:\/\//);
    expect(place.radiusMeters).toBeGreaterThan(0);
    // Rough bounding box around Harlem and Morningside Heights.
    expect(place.latitude).toBeGreaterThan(40.79);
    expect(place.latitude).toBeLessThan(40.83);
    expect(place.longitude).toBeGreaterThan(-73.97);
    expect(place.longitude).toBeLessThan(-73.93);
  });

  it.each(places.map((p) => [p.id, p] as const))(
    '%s has a base reward the policy engine would accept',
    (_id, place) => {
      expect(place.baseReward).toBeGreaterThan(0);
      expect(place.baseReward).toBeLessThanOrEqual(MAX_PER_TASK);
      expect(Math.abs(place.baseReward * 100 - Math.round(place.baseReward * 100))).toBeLessThan(1e-6);
    }
  );

  it('only uses neighborhoods the Solana module can map to a collection', () => {
    const config = {
      collections: { harlem: 'harlemCollection', morningside: 'morningsideCollection' },
    } as Parameters<typeof collectionForPlace>[0];

    for (const place of places) {
      expect(['harlemCollection', 'morningsideCollection']).toContain(
        collectionForPlace(config, place as Parameters<typeof collectionForPlace>[1])
      );
    }
  });

  it('covers both neighborhoods', () => {
    const hoods = new Set(places.map((p) => p.neighborhood));
    expect(hoods).toEqual(new Set(['Harlem', 'Morningside Heights']));
  });

  it('keeps geofences from overlapping so one spot cannot claim two places', () => {
    const metersBetween = (a: Place, b: Place): number => {
      const dLat = (a.latitude - b.latitude) * 111_000;
      const dLon = (a.longitude - b.longitude) * 111_000 * Math.cos((a.latitude * Math.PI) / 180);
      return Math.hypot(dLat, dLon);
    };
    for (let i = 0; i < places.length; i++) {
      for (let j = i + 1; j < places.length; j++) {
        const gap = metersBetween(places[i], places[j]);
        expect(gap).toBeGreaterThan(places[i].radiusMeters + places[j].radiusMeters);
      }
    }
  });
});
