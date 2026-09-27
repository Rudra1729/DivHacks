import { createSessionToken, verifySessionToken, SessionTokenError } from '../../src/auth/tokens';

const env = { SESSION_SECRET: 'test-session-secret' };

describe('session tokens', () => {
  it('round-trips a user ID through create and verify', () => {
    const token = createSessionToken('user-123', env);
    expect(verifySessionToken(token, env)).toBe('user-123');
  });

  it('throws if SESSION_SECRET is missing', () => {
    expect(() => createSessionToken('user-123', {})).toThrow(SessionTokenError);
  });

  it('rejects a token signed with a different secret', () => {
    const token = createSessionToken('user-123', env);
    expect(() => verifySessionToken(token, { SESSION_SECRET: 'other-secret' })).toThrow(SessionTokenError);
  });

  it('rejects a tampered payload', () => {
    const token = createSessionToken('user-123', env);
    const [, signature] = token.split('.');
    const forgedPayload = Buffer.from(JSON.stringify({ userId: 'someone-else', exp: Date.now() + 1000 })).toString(
      'base64url'
    );
    expect(() => verifySessionToken(`${forgedPayload}.${signature}`, env)).toThrow(SessionTokenError);
  });

  it('rejects an expired token', () => {
    const nearlyExpiredEnv = env;
    const token = createSessionToken('user-123', nearlyExpiredEnv);
    const [encodedPayload] = token.split('.');
    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    payload.exp = Date.now() - 1000;
    const rebuiltPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const { createHmac } = require('crypto');
    const signature = createHmac('sha256', env.SESSION_SECRET).update(rebuiltPayload).digest('base64url');
    expect(() => verifySessionToken(`${rebuiltPayload}.${signature}`, env)).toThrow('expired');
  });

  it('rejects a malformed token', () => {
    expect(() => verifySessionToken('not-a-token', env)).toThrow(SessionTokenError);
  });
});
