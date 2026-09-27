/**HTTP helpers for talking to the live server, and a valid photo to send.*/

import { randomBytes } from 'crypto';

export interface ApiResponse {
  status: number;
  body: any;
}

/** A tiny valid PNG. Unique bytes are appended per photo so every photo hashes differently. */
const PNG_1X1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64'
);

/** Make a photo that has never been seen before.

Returns:
    Buffer: A valid PNG followed by random bytes.
*/
export function freshPhoto(): Buffer {
  return Buffer.concat([PNG_1X1, randomBytes(16)]);
}

export interface Submission {
  placeId: string;
  latitude: number;
  longitude: number;
  timestamp?: string;
  xrplAddress: string;
  solanaAddress: string;
  caption?: string;
  requestId?: string;
  photo?: Buffer | null;
}

/** Send a mission submission the way the app would.

Args:
    baseUrl (string): The server's address.
    submission (Submission): What to send. A missing photo means a fresh one, and null means none.

Returns:
    Promise<ApiResponse>: HTTP status and parsed JSON body.
*/
export async function submit(baseUrl: string, submission: Submission): Promise<ApiResponse> {
  const form = new FormData();
  form.append('placeId', submission.placeId);
  form.append('latitude', String(submission.latitude));
  form.append('longitude', String(submission.longitude));
  form.append('timestamp', submission.timestamp ?? new Date().toISOString());
  form.append('xrplAddress', submission.xrplAddress);
  form.append('solanaAddress', submission.solanaAddress);
  if (submission.caption) {
    form.append('caption', submission.caption);
  }
  if (submission.requestId) {
    form.append('requestId', submission.requestId);
  }
  if (submission.photo !== null) {
    const photo = submission.photo ?? freshPhoto();
    form.append('photo', new Blob([new Uint8Array(photo)], { type: 'image/png' }), 'photo.png');
  }
  const response = await fetch(`${baseUrl}/submissions`, { method: 'POST', body: form });
  return { status: response.status, body: await response.json().catch(() => null) };
}

/** GET a JSON path from the server.

Args:
    baseUrl (string): The server's address.
    path (string): Path such as /places.

Returns:
    Promise<ApiResponse>: HTTP status and parsed JSON body.
*/
export async function getJson(baseUrl: string, path: string): Promise<ApiResponse> {
  const response = await fetch(`${baseUrl}${path}`);
  return { status: response.status, body: await response.json().catch(() => null) };
}

/** POST JSON, for the test-only routes.

Args:
    baseUrl (string): The server's address.
    path (string): Path such as /test/attack.
    body (unknown): Optional JSON body.

Returns:
    Promise<ApiResponse>: HTTP status and parsed JSON body.
*/
export async function post(baseUrl: string, path: string, body?: unknown): Promise<ApiResponse> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { status: response.status, body: await response.json().catch(() => null) };
}
