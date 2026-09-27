/**Sentinel location check: is the user within the place's geofence?*/

import { Place } from '../data/places';

export interface CheckResult {
  passed: boolean;
  message: string;
}

const EARTH_RADIUS_METERS = 6371000;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/** Compute the great-circle distance between two coordinates.

Args:
    lat1 (number): First point's latitude, in degrees.
    lon1 (number): First point's longitude, in degrees.
    lat2 (number): Second point's latitude, in degrees.
    lon2 (number): Second point's longitude, in degrees.

Returns:
    number: Distance in meters.
*/
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_METERS * c;
}

/** Check whether a submitted location is within a place's geofence.

Args:
    place (Place): The place being claimed.
    latitude (number): The submitted latitude.
    longitude (number): The submitted longitude.

Returns:
    CheckResult: Whether the check passed, and a human-readable reason.
*/
export function checkLocation(place: Place, latitude: number, longitude: number): CheckResult {
  const distance = haversineDistanceMeters(place.latitude, place.longitude, latitude, longitude);

  if (distance > place.geofenceRadiusMeters) {
    return {
      passed: false,
      message: `location: ${Math.round(distance)}m from ${place.name}, max is ${place.geofenceRadiusMeters}m`,
    };
  }

  return { passed: true, message: `location: ${Math.round(distance)}m from ${place.name}, within range` };
}
