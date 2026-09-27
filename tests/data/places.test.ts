import { PLACES, Place } from '../../src/data/places';
import { MAX_PER_TASK } from '../../src/policy/rules';
import { collectionForPlace } from '../../src/solana/places';

/**
 * Independent reference coordinates, from OpenStreetMap and Wikidata.
 * Malcolm Shabazz Harlem Market has an OpenStreetMap entry only. The Mudd
 * building reference is its street corner, 120th Street and Amsterdam Avenue.
 */
const REFERENCE: Record<string, [number, number]> = {
  'apollo-theater': [40.80993, -73.95011],
  'studio-museum-harlem': [40.80829, -73.94769],
  'marcus-garvey-park': [40.80417, -73.94333],
  'hamilton-grange': [40.82139, -73.94722],
  'malcolm-shabazz-market': [40.80147, -73.94886],
  'morningside-park': [40.8062, -73.9586],
  'mudd-building': [40.810807, -73.959811],
};

function metersBetween(aLat: number, aLon: number, bLat: number, bLon: number): number {
  const dLat = (aLat - bLat) * 111_000;
  const dLon = (aLon - bLon) * 111_000 * Math.cos((aLat * Math.PI) / 180);
  return Math.hypot(dLat, dLon);
}

describe('PLACES', () => {
  it('has the 6 places the PRD calls for, plus the Mudd building for on-site testing', () => {
    expect(PLACES).toHaveLength(7);
  });

  it('gives every place a unique ID', () => {
    const ids = PLACES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it.each(PLACES.map((p) => [p.id, p] as [string, Place]))('%s has valid fields', (_id, place) => {
    expect(place.name.length).toBeGreaterThan(0);
    expect(place.imageUrl).toMatch(/^https:\/\//);
    expect(place.imageUrl).not.toContain('example.com');
    expect(place.geofenceRadiusMeters).toBeGreaterThan(0);
    // Rough bounding box around Harlem and Morningside Heights.
    expect(place.latitude).toBeGreaterThan(40.79);
    expect(place.latitude).toBeLessThan(40.83);
    expect(place.longitude).toBeGreaterThan(-73.97);
    expect(place.longitude).toBeLessThan(-73.93);
  });

  it.each(PLACES.map((p) => [p.id, p] as [string, Place]))(
    '%s has a base reward the policy engine would accept',
    (_id, place) => {
      expect(place.baseRewardRlusd).toBeGreaterThan(0);
      expect(place.baseRewardRlusd).toBeLessThanOrEqual(MAX_PER_TASK);
      const cents = place.baseRewardRlusd * 100;
      expect(Math.abs(cents - Math.round(cents))).toBeLessThan(1e-6);
    }
  );

  it.each(PLACES.map((p) => [p.id, p] as [string, Place]))(
    '%s pin is within 100 m of the reference coordinates',
    (id, place) => {
      const [refLat, refLon] = REFERENCE[id];
      expect(metersBetween(place.latitude, place.longitude, refLat, refLon)).toBeLessThan(100);
    }
  );

  it('has a reference pin for every place', () => {
    expect(Object.keys(REFERENCE).sort()).toEqual(PLACES.map((p) => p.id).sort());
  });

  it('only uses neighborhoods the Solana module can map to a collection', () => {
    const config = {
      collections: { harlem: 'harlemCollection', morningside: 'morningsideCollection' },
    } as Parameters<typeof collectionForPlace>[0];

    for (const place of PLACES) {
      expect(['harlemCollection', 'morningsideCollection']).toContain(
        collectionForPlace(config, place)
      );
    }
  });

  it('covers both neighborhoods', () => {
    expect(new Set(PLACES.map((p) => p.neighborhood))).toEqual(
      new Set(['Harlem', 'Morningside Heights'])
    );
  });

  it('keeps places at least 200 m apart so pins are not near-duplicates', () => {
    for (let i = 0; i < PLACES.length; i++) {
      for (let j = i + 1; j < PLACES.length; j++) {
        const a = PLACES[i];
        const b = PLACES[j];
        expect(metersBetween(a.latitude, a.longitude, b.latitude, b.longitude)).toBeGreaterThan(200);
      }
    }
  });
});
