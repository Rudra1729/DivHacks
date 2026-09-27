import { distanceMeters, isWithinNyc, MIN_DISTANCE_FROM_EXISTING_METERS } from '../../src/missions/nyc';

describe('isWithinNyc', () => {
  it('accepts a Harlem coordinate', () => {
    expect(isWithinNyc(40.8102, -73.95)).toBe(true);
  });

  it('accepts a point in each other borough', () => {
    expect(isWithinNyc(40.7143, -73.9506)).toBe(true); // Brooklyn
    expect(isWithinNyc(40.7527, -73.863)).toBe(true); // Queens
    expect(isWithinNyc(40.8994, -73.9128)).toBe(true); // Bronx
    expect(isWithinNyc(40.6035, -74.0679)).toBe(true); // Staten Island
  });

  it('rejects a coordinate far outside NYC', () => {
    expect(isWithinNyc(34.0522, -118.2437)).toBe(false); // Los Angeles
    expect(isWithinNyc(51.5074, -0.1278)).toBe(false); // London
  });

  it('rejects non-finite input', () => {
    expect(isWithinNyc(NaN, -73.95)).toBe(false);
    expect(isWithinNyc(40.81, Infinity)).toBe(false);
  });
});

describe('distanceMeters', () => {
  it('is zero for the same point', () => {
    expect(distanceMeters({ latitude: 40.81, longitude: -73.95 }, { latitude: 40.81, longitude: -73.95 })).toBe(0);
  });

  it('matches a known real-world distance within a small margin', () => {
    // Apollo Theater to Studio Museum in Harlem, real coordinates, about 285m apart.
    const apollo = { latitude: 40.8102, longitude: -73.95 };
    const studio = { latitude: 40.80835, longitude: -73.94766 };
    const meters = distanceMeters(apollo, studio);
    expect(meters).toBeGreaterThan(200);
    expect(meters).toBeLessThan(400);
  });

  it('is well above the minimum-distance threshold for points a mile apart', () => {
    const a = { latitude: 40.81, longitude: -73.95 };
    const b = { latitude: 40.82, longitude: -73.96 };
    expect(distanceMeters(a, b)).toBeGreaterThan(MIN_DISTANCE_FROM_EXISTING_METERS);
  });
});
