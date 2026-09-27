/**Geography helpers for the mission scout.

A generous bounding box around the five boroughs, used to reject anything
Grok proposes outside New York City, plus distance checks to keep new
missions from duplicating a place we already have.
*/

/** Loosely covers the five boroughs, with a small margin. Rejects the rest of the world, not a tight city line. */
export const NYC_BOUNDS = {
  minLat: 40.49,
  maxLat: 40.92,
  minLng: -74.27,
  maxLng: -73.68,
};

/** Check whether a coordinate falls inside the NYC bounding box.

Args:
    latitude (number): Latitude to check.
    longitude (number): Longitude to check.

Returns:
    boolean: True if the point is within NYC_BOUNDS.
*/
export function isWithinNyc(latitude: number, longitude: number): boolean {
  return (
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= NYC_BOUNDS.minLat &&
    latitude <= NYC_BOUNDS.maxLat &&
    longitude >= NYC_BOUNDS.minLng &&
    longitude <= NYC_BOUNDS.maxLng
  );
}

const EARTH_RADIUS_METERS = 6371000;

/** Distance between two coordinates, in meters (haversine formula).

Args:
    a ({ latitude: number; longitude: number }): First point.
    b ({ latitude: number; longitude: number }): Second point.

Returns:
    number: Great-circle distance in meters.
*/
export function distanceMeters(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number }
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLng = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Minimum distance from any existing place for a candidate to count as a new mission, not a duplicate. */
export const MIN_DISTANCE_FROM_EXISTING_METERS = 400;
