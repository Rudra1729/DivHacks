import express, { Express } from 'express';
import Database from 'better-sqlite3';
import request from 'supertest';
import { openDatabase } from '../../src/db';
import { createUser } from '../../src/db/users';
import { createSessionToken } from '../../src/auth/tokens';
import { createWalletRouter } from '../../src/routes/wallet';
import { XrplService } from '../../src/xrpl/types';

const WALLETS = {
  xrplAddress: 'rXRPLADDRESS',
  xrplSecretEncrypted: 'iv:tag:cipher',
  solanaAddress: 'SoLANAaddress',
  solanaSecretEncrypted: 'iv:tag:cipher2',
};

function buildWalletTestApp(): { app: Express; db: Database.Database } {
  const db = openDatabase(':memory:');
  const xrpl: XrplService = {
    sendPayment: jest.fn(),
    getPaidToday: jest.fn(),
    getAgentAddress: () => 'rAgent',
    getRlusdBalance: async (address: string) => (address === WALLETS.xrplAddress ? 4.5 : 0),
  };
  const app = express();
  app.use(express.json());
  app.use(createWalletRouter(db, xrpl));
  return { app, db };
}

describe('wallet routes', () => {
  const originalSessionSecret = process.env.SESSION_SECRET;

  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-session-secret';
  });

  afterAll(() => {
    process.env.SESSION_SECRET = originalSessionSecret;
  });

  it('rejects requests with no Authorization header', async () => {
    const { app } = buildWalletTestApp();
    const response = await request(app).get('/me/nft');
    expect(response.status).toBe(401);
  });

  it('rejects a malformed or invalid token', async () => {
    const { app } = buildWalletTestApp();
    const response = await request(app).get('/me/nft').set('Authorization', 'Bearer not-a-real-token');
    expect(response.status).toBe(401);
  });

  it('returns the logged-in user own NFT stamps', async () => {
    const { app, db } = buildWalletTestApp();
    const user = createUser(db, 'person@example.com', WALLETS);
    const token = createSessionToken(user.id);

    const response = await request(app).get('/me/nft').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.solanaAddress).toBe(WALLETS.solanaAddress);
    expect(Array.isArray(response.body.stamps)).toBe(true);
  });

  it('returns the logged-in user own RLUSD balance', async () => {
    const { app, db } = buildWalletTestApp();
    const user = createUser(db, 'person@example.com', WALLETS);
    const token = createSessionToken(user.id);

    const response = await request(app).get('/me/rlusd-balance').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.xrplAddress).toBe(WALLETS.xrplAddress);
    expect(response.body.balance).toBe(4.5);
  });

  it('rejects a token for a user that no longer exists', async () => {
    const { app } = buildWalletTestApp();
    const token = createSessionToken('deleted-user-id');
    const response = await request(app).get('/me/nft').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(401);
  });
});
