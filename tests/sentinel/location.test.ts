import { checkLocation, haversineDistanceMeters } from '../../src/sentinel/location';
import { getPlaceById } from '../../src/data/places';

describe('checkLocation', () => {
  const place = getPlaceById('apollo-theater')!;

  it('passes when within the geofence', () => {
    const result = checkLocation(place, place.latitude, place.longitude);
    expect(result.passed).toBe(true);
  });

  it('fails when far outside the geofence', () => {
    const result = checkLocation(place, place.latitude + 1, place.longitude + 1);
    expect(result.passed).toBe(false);
    expect(result.message).toContain('max is 150m');
  });
});

describe('haversineDistanceMeters', () => {
  it('returns 0 for identical points', () => {
    expect(haversineDistanceMeters(40.81, -73.95, 40.81, -73.95)).toBe(0);
  });
});
