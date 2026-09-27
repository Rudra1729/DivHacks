/**GPS trails for the live checks, shaped like a real phone's or a spoofing tool's.

The server wants the readings a phone collected while the camera was open. A
real phone wobbles a few meters between readings; a browser location override
repeats the exact same reading.
*/

import { LocationSample } from '../../../src/orchestrator/types';

const METERS_PER_DEGREE_LATITUDE = 111_320;
const SAMPLES = 10;
const SPAN_MS = 18_000;

function offsetMeters(latitude: number, longitude: number, north: number, east: number): { latitude: number; longitude: number } {
  const metersPerDegreeLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos((latitude * Math.PI) / 180);
  return {
    latitude: latitude + north / METERS_PER_DEGREE_LATITUDE,
    longitude: longitude + east / metersPerDegreeLongitude,
  };
}

function timestampAt(index: number, endAt: number): number {
  return Math.round(endAt - SPAN_MS + (index * SPAN_MS) / (SAMPLES - 1));
}

/** A trail like a real phone standing 10 to 40 m from a point for 18 seconds.

Args:
    latitude (number): Latitude to stand near, such as a place's pin.
    longitude (number): Longitude to stand near.

Returns:
    LocationSample[]: Ten readings, oldest first, ending now.
*/
export function phoneTrail(latitude: number, longitude: number): LocationSample[] {
  const angle = Math.random() * 2 * Math.PI;
  const radius = 10 + Math.random() * 30;
  const standing = offsetMeters(latitude, longitude, radius * Math.cos(angle), radius * Math.sin(angle));
  const endAt = Date.now();
  return Array.from({ length: SAMPLES }, (_, i) => ({
    ...offsetMeters(standing.latitude, standing.longitude, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6),
    accuracy: Math.round((6 + Math.random() * 19) * 10) / 10,
    timestamp: timestampAt(i, endAt),
  }));
}

/** A trail like a browser location override: the same reading ten times.

Args:
    latitude (number): The faked latitude.
    longitude (number): The faked longitude.

Returns:
    LocationSample[]: Ten identical readings at Chrome's default 150 m accuracy, ending now.
*/
export function frozenTrail(latitude: number, longitude: number): LocationSample[] {
  const endAt = Date.now();
  return Array.from({ length: SAMPLES }, (_, i) => ({ latitude, longitude, accuracy: 150, timestamp: timestampAt(i, endAt) }));
}
