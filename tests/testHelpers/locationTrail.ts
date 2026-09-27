/**Test helpers that build GPS trails like a real phone, or like a spoofing tool.*/

import { LocationSample } from '../../src/orchestrator/types';

const METERS_PER_DEGREE_LATITUDE = 111_320;

/** Move a point by a number of meters north and east.

Args:
    point ({ latitude: number; longitude: number }): Starting point.
    north (number): Meters north, negative for south.
    east (number): Meters east, negative for west.

Returns:
    { latitude: number; longitude: number }: The moved point.
*/
export function offsetMeters(
  point: { latitude: number; longitude: number },
  north: number,
  east: number
): { latitude: number; longitude: number } {
  const metersPerDegreeLongitude = METERS_PER_DEGREE_LATITUDE * Math.cos((point.latitude * Math.PI) / 180);
  return {
    latitude: point.latitude + north / METERS_PER_DEGREE_LATITUDE,
    longitude: point.longitude + east / metersPerDegreeLongitude,
  };
}

export interface TrailOptions {
  /** Number of readings. Defaults to 10. */
  samples?: number;
  /** Time the trail covers, in ms. Defaults to 18 seconds. */
  spanMs?: number;
  /** Time of the last reading, epoch ms. Defaults to now. */
  endAt?: number;
}

/** A trail like a real phone standing near a point: a random spot 10 to 40 m
from it, wobbling a few meters, with accuracy varying between 6 and 25 m.

Args:
    near ({ latitude: number; longitude: number }): Point to stand near, such as a place's pin.
    options (TrailOptions): Number of readings, time covered, and end time.

Returns:
    LocationSample[]: Readings oldest first. Submit the last one as the location.
*/
export function realisticTrail(
  near: { latitude: number; longitude: number },
  options: TrailOptions = {}
): LocationSample[] {
  const samples = options.samples ?? 10;
  const spanMs = options.spanMs ?? 18_000;
  const endAt = options.endAt ?? Date.now();
  const angle = Math.random() * 2 * Math.PI;
  const radius = 10 + Math.random() * 30;
  const standing = offsetMeters(near, radius * Math.cos(angle), radius * Math.sin(angle));

  return Array.from({ length: samples }, (_, i) => {
    const wobble = offsetMeters(standing, (Math.random() - 0.5) * 6, (Math.random() - 0.5) * 6);
    return {
      ...wobble,
      accuracy: Math.round((6 + Math.random() * 19) * 10) / 10,
      timestamp: Math.round(endAt - spanMs + (i * spanMs) / Math.max(samples - 1, 1)),
    };
  });
}

/** A trail like a browser's location override: the same reading every time.

Args:
    at ({ latitude: number; longitude: number }): The faked point.
    accuracy (number): The accuracy the tool reports. Chrome's default is 150 m.
    options (TrailOptions): Number of readings, time covered, and end time.

Returns:
    LocationSample[]: Identical readings, oldest first.
*/
export function frozenTrail(
  at: { latitude: number; longitude: number },
  accuracy = 150,
  options: TrailOptions = {}
): LocationSample[] {
  const samples = options.samples ?? 10;
  const spanMs = options.spanMs ?? 18_000;
  const endAt = options.endAt ?? Date.now();
  return Array.from({ length: samples }, (_, i) => ({
    latitude: at.latitude,
    longitude: at.longitude,
    accuracy,
    timestamp: Math.round(endAt - spanMs + (i * spanMs) / Math.max(samples - 1, 1)),
  }));
}

/** The last reading of a trail, as the point to submit.

Args:
    trail (LocationSample[]): A non-empty trail.

Returns:
    { latitude: number; longitude: number }: Where the trail ends.
*/
export function endOf(trail: LocationSample[]): { latitude: number; longitude: number } {
  const last = trail[trail.length - 1];
  return { latitude: last.latitude, longitude: last.longitude };
}
