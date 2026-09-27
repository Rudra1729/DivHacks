/**Session tokens for logged-in users.

A token is `<base64url payload>.<base64url HMAC-SHA256 signature>`, signed
with SESSION_SECRET. No external JWT library: the payload is just
{ userId, exp }, and verification is one HMAC comparison.
*/

import { createHmac, timingSafeEqual } from 'crypto';

/** Raised when SESSION_SECRET is missing or a token fails verification. */
export class SessionTokenError extends Error {}

export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;

interface SessionPayload {
  userId: string;
  exp: number;
}

function loadSecret(env: NodeJS.ProcessEnv): string {
  const secret = env.SESSION_SECRET;
  if (!secret) {
    throw new SessionTokenError('SESSION_SECRET is missing. Session tokens cannot be issued or verified without it.');
  }
  return secret;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

/** Issue a signed session token for a user.

Args:
    userId (string): The authenticated user's ID.
    env (NodeJS.ProcessEnv): Environment to read SESSION_SECRET from.

Returns:
    string: An opaque session token.
*/
export function createSessionToken(userId: string, env: NodeJS.ProcessEnv = process.env): string {
  const secret = loadSecret(env);
  const payload: SessionPayload = { userId, exp: Date.now() + SESSION_TTL_MS };
  const encodedPayload = base64url(JSON.stringify(payload));
  return `${encodedPayload}.${sign(encodedPayload, secret)}`;
}

/** Verify a session token and return the user ID it was issued for.

Args:
    token (string): Token from the Authorization header.
    env (NodeJS.ProcessEnv): Environment to read SESSION_SECRET from.

Returns:
    string: The user ID the token was issued for.

Raises:
    SessionTokenError: If the token is malformed, has an invalid
        signature, or has expired.
*/
export function verifySessionToken(token: string, env: NodeJS.ProcessEnv = process.env): string {
  const secret = loadSecret(env);
  const [encodedPayload, signature] = token.split('.');
  if (!encodedPayload || !signature) {
    throw new SessionTokenError('Malformed session token.');
  }

  const expected = Buffer.from(sign(encodedPayload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) {
    throw new SessionTokenError('Invalid session token signature.');
  }

  let payload: SessionPayload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new SessionTokenError('Malformed session token payload.');
  }
  if (typeof payload.userId !== 'string' || typeof payload.exp !== 'number') {
    throw new SessionTokenError('Malformed session token payload.');
  }
  if (Date.now() > payload.exp) {
    throw new SessionTokenError('Session token has expired.');
  }
  return payload.userId;
}
