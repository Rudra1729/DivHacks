/**Sentinel plausibility checks: does this location look like a real phone?

The geofence check trusts the coordinates it is sent, and a browser will send
any coordinates the user types into its developer tools. These checks look
for the tell-tale signs of a faked location instead:

- Trail: the app samples GPS every couple of seconds while the camera is
  open. A missing, short, stale, or mismatched trail is rejected.
- Frozen trail: real GPS wobbles by a few meters. A trail where every reading
  is identical, down to the reported accuracy, is a spoofing tool.
- Accuracy: phones never report 1 m or better, and readings worse than
  200 m cannot prove anyone is at a place.
- Typed coordinates: real readings have many decimal places. Coordinates with
  four or fewer, or sitting exactly on the place's map pin, were typed in.
- Impossible travel: a wallet cannot move faster than 80 km/h between
  passed check-ins.
- Clusters: many wallets sending the exact same point means one device or
  script is claiming for all of them.

Every function here is pure and returns plain-language failures, so Sentinel
can report them all together.
*/

import { LocationRecord } from '../db/locationHistory';
import { LocationSample, Place } from '../orchestrator/types';
import { haversineDistanceMeters } from './location';

/** Thresholds for the plausibility checks. */
export const PLAUSIBILITY_LIMITS = {
  /** Fewest readings a trail must have. */
  minSamples: 5,
  /** Shortest time a trail must cover, in ms. */
  minSpanMs: 10_000,
  /** Oldest the last reading may be when the submission arrives, in ms. */
  maxTrailAgeMs: 5 * 60_000,
  /** How far ahead of the server clock a reading may be, in ms. */
  maxClockSkewMs: 60_000,
  /** How far the submitted point may be from the last reading, in meters. */
  submittedPointMatchMeters: 5,
  /** Readings claiming this accuracy or better are flagged, in meters. */
  minAccuracyMeters: 1,
  /** Readings worse than this cannot prove presence, in meters. */
  maxAccuracyMeters: 200,
  /** A submitted point this close to the map pin looks typed in, in meters. */
  exactPinMeters: 1,
  /** Coordinates with at most this many decimals look typed in. */
  roundDecimals: 4,
  /** Fastest believable travel between check-ins: 80 km/h, in m/s. */
  maxSpeedMetersPerSecond: 80 / 3.6,
  /** Moves shorter than this are never called impossible, in meters. */
  travelSlackMeters: 500,
  /** How far back the cluster check looks, in ms. */
  clusterWindowMs: 24 * 60 * 60_000,
  /** Most other wallets allowed at the exact same point in that window. */
  maxOtherWalletsAtPoint: 2,
};

/** A latitude and longitude pair. */
export interface Point {
  latitude: number;
  longitude: number;
}

function distance(a: Point, b: Point): number {
  return haversineDistanceMeters(a.latitude, a.longitude, b.latitude, b.longitude);
}

function seconds(ms: number): number {
  return Math.round(ms / 1000);
}

/** Check that a trail exists, is long and recent enough, and ends at the submitted point.

Args:
    trail (LocationSample[] | undefined): Readings sent with the submission, oldest first.
    submitted (Point): The submitted latitude and longitude.
    now (number): Server time, epoch ms.

Returns:
    string[]: Failures, empty if the trail is usable.
*/
export function checkTrail(trail: LocationSample[] | undefined, submitted: Point, now: number): string[] {
  const limits = PLAUSIBILITY_LIMITS;
  if (!trail || trail.length === 0) {
    return ['location trail: missing, the app must sample GPS while the camera is open'];
  }
  if (trail.length < limits.minSamples) {
    return [`location trail: only ${trail.length} GPS readings, need at least ${limits.minSamples}`];
  }

  const failures: string[] = [];
  const inOrder = trail.every((sample, i) => i === 0 || sample.timestamp >= trail[i - 1].timestamp);
  if (!inOrder) {
    failures.push('location trail: readings are out of time order');
  }

  const first = trail[0];
  const last = trail[trail.length - 1];
  const span = last.timestamp - first.timestamp;
  if (inOrder && span < limits.minSpanMs) {
    failures.push(`location trail: covers ${seconds(span)}s, need at least ${seconds(limits.minSpanMs)}s`);
  }
  if (last.timestamp > now + limits.maxClockSkewMs) {
    failures.push('location trail: readings are from the future');
  } else if (now - last.timestamp > limits.maxTrailAgeMs) {
    failures.push(`location trail: last GPS reading is ${seconds(now - last.timestamp)}s old, max is ${seconds(limits.maxTrailAgeMs)}s`);
  }
  if (distance(last, submitted) > limits.submittedPointMatchMeters) {
    failures.push('location trail: submitted location does not match the last GPS reading');
  }
  return failures;
}

/** Flag a trail where every reading is identical, which real GPS never produces.

Args:
    trail (LocationSample[]): Readings sent with the submission.

Returns:
    string[]: A failure if the trail never moved, else empty.
*/
export function checkFrozenTrail(trail: LocationSample[]): string[] {
  if (trail.length < 2) {
    return [];
  }
  const [first] = trail;
  const frozen = trail.every(
    (sample) =>
      sample.latitude === first.latitude &&
      sample.longitude === first.longitude &&
      sample.accuracy === first.accuracy
  );
  if (!frozen) {
    return [];
  }
  const span = trail[trail.length - 1].timestamp - first.timestamp;
  return [`location trail: GPS did not move at all over ${seconds(span)}s, real GPS always wobbles`];
}

/** Flag readings with impossibly good or uselessly bad reported accuracy.

Args:
    trail (LocationSample[]): Readings sent with the submission.

Returns:
    string[]: Failures, empty if every reading's accuracy is believable.
*/
export function checkAccuracy(trail: LocationSample[]): string[] {
  const limits = PLAUSIBILITY_LIMITS;
  if (trail.length === 0) {
    return [];
  }
  const accuracies = trail.map((sample) => sample.accuracy);
  const best = Math.min(...accuracies);
  const worst = Math.max(...accuracies);
  const failures: string[] = [];
  if (best <= limits.minAccuracyMeters) {
    failures.push(`gps accuracy: a reading claims ${best}m accuracy, real phones report more than ${limits.minAccuracyMeters}m`);
  }
  if (worst > limits.maxAccuracyMeters) {
    failures.push(
      `gps accuracy: a reading is only accurate to ${Math.round(worst)}m, max is ${limits.maxAccuracyMeters}m, try again outdoors`
    );
  }
  return failures;
}

/** Whether a coordinate has at most the given number of decimal places.

Args:
    value (number): Latitude or longitude.
    decimals (number): Most decimal places allowed.

Returns:
    boolean: True if the value is that round.
*/
function isRound(value: number, decimals: number): boolean {
  const scaled = value * 10 ** decimals;
  return Math.abs(scaled - Math.round(scaled)) < 1e-6;
}

/** Flag coordinates that look typed in: too few decimals, or exactly on the map pin.

Args:
    place (Place): The place being claimed.
    submitted (Point): The submitted latitude and longitude.
    trail (LocationSample[]): Readings sent with the submission.

Returns:
    string[]: Failures, empty if the coordinates look like real readings.
*/
export function checkTypedCoordinates(place: Place, submitted: Point, trail: LocationSample[]): string[] {
  const limits = PLAUSIBILITY_LIMITS;
  const failures: string[] = [];
  const round = [submitted, ...trail].find(
    (point) => isRound(point.latitude, limits.roundDecimals) && isRound(point.longitude, limits.roundDecimals)
  );
  if (round) {
    failures.push(
      `coordinates: ${round.latitude}, ${round.longitude} look typed in, real GPS gives more than ${limits.roundDecimals} decimal places`
    );
  }
  if (distance(place, submitted) < limits.exactPinMeters) {
    failures.push(`coordinates: exactly on ${place.name}'s map pin, which real GPS almost never is`);
  }
  return failures;
}

/** Flag a wallet that moved faster than a car could since its last passed check-in.

Args:
    previous (LocationRecord | undefined): The wallet's last recorded location.
    submitted (Point): The submitted latitude and longitude.
    now (number): Server time, epoch ms.

Returns:
    string[]: A failure if the move is impossible, else empty.
*/
export function checkImpossibleTravel(previous: LocationRecord | undefined, submitted: Point, now: number): string[] {
  const limits = PLAUSIBILITY_LIMITS;
  if (!previous) {
    return [];
  }
  const meters = distance(previous, submitted);
  if (meters <= limits.travelSlackMeters) {
    return [];
  }
  const elapsedSeconds = Math.max(now - previous.recordedAt, 1) / 1000;
  if (meters / elapsedSeconds <= limits.maxSpeedMetersPerSecond) {
    return [];
  }
  const km = (meters / 1000).toFixed(1);
  return [
    `impossible travel: ${km} km from this wallet's last check-in ${Math.round(elapsedSeconds)}s ago, faster than 80 km/h`,
  ];
}

/** Flag a point that too many other wallets have already sent.

Args:
    otherWallets (number): Other wallets recorded at the exact same point recently.

Returns:
    string[]: A failure if the point is shared by too many wallets, else empty.
*/
export function checkCluster(otherWallets: number): string[] {
  if (otherWallets < PLAUSIBILITY_LIMITS.maxOtherWalletsAtPoint) {
    return [];
  }
  return [`cluster: ${otherWallets} other wallets already sent these exact coordinates in the last 24 hours`];
}
