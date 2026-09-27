import express, { Express } from 'express';
import Database from 'better-sqlite3';
import request from 'supertest';
import { openDatabase } from '../../src/db';
import { createUser } from '../../src/db/users';
import { createSessionToken } from '../../src/auth/tokens';
import { createWalletRouter } from '../../src/routes/wallet';
import { XrplService } from '../../src/xrpl/types';
import { upsertDecision, createDecision, updateDecision } from '../../src/db/decisions';
import { fakeStampService } from '../../src/solana/fakeStamps';

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

  it('adds the RLUSD each visit paid to its stamp, 0 for stamp-only visits', async () => {
    const { app, db } = buildWalletTestApp();
    const user = createUser(db, 'person@example.com', WALLETS);
    createDecision(db, 'paid-1', 'mudd-entrance', 'OK');
    updateDecision(db, 'paid-1', { amount: 0.01, xrplHash: 'HASH1' });
    createDecision(db, 'stamp-only-1', 'mudd-building', 'OK');
    const owner = WALLETS.solanaAddress;
    await fakeStampService.mintStamp({ decisionId: 'paid-1', placeId: 'mudd-entrance', userSolanaAddress: owner, xrplTxHash: 'HASH1' });
    await fakeStampService.mintStamp({ decisionId: 'stamp-only-1', placeId: 'mudd-building', userSolanaAddress: owner, xrplTxHash: '' });

    const response = await request(app).get('/me/nft').set('Authorization', `Bearer ${createSessionToken(user.id)}`);
    const rewards = Object.fromEntries(
      response.body.stamps.map((s: { decisionId: string; rewardRlusd: number }) => [s.decisionId, s.rewardRlusd])
    );
    expect(rewards).toEqual({ 'paid-1': 0.01, 'stamp-only-1': 0 });
    fakeStampService.reset();
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

  it('returns the logged-in user own transactions, newest first, with the place name resolved', async () => {
    const { app, db } = buildWalletTestApp();
    const user = createUser(db, 'person@example.com', WALLETS);
    const token = createSessionToken(user.id);

    upsertDecision(db, {
      id: 'dec-1',
      requestId: 'dec-1',
      placeId: 'apollo-theater',
      xrplAddress: WALLETS.xrplAddress,
      amount: 1,
      status: 'OK',
      xrplHash: 'HASH1',
    });

    const response = await request(app).get('/me/transactions').set('Authorization', `Bearer ${token}`);
    expect(response.status).toBe(200);
    expect(response.body.transactions).toEqual([
      {
        decisionId: 'dec-1',
        placeId: 'apollo-theater',
        placeName: 'Apollo Theater',
        amount: 1,
        status: 'OK',
        xrplHash: 'HASH1',
        createdAt: expect.any(String),
      },
    ]);
  });

  it('never returns another user\'s transactions', async () => {
    const { app, db } = buildWalletTestApp();
    const user = createUser(db, 'person@example.com', WALLETS);
    const token = createSessionToken(user.id);

    upsertDecision(db, {
      id: 'dec-2',
      requestId: 'dec-2',
      placeId: 'apollo-theater',
      xrplAddress: 'rSomeoneElse',
      amount: 1,
      status: 'OK',
    });

    const response = await request(app).get('/me/transactions').set('Authorization', `Bearer ${token}`);
    expect(response.body.transactions).toEqual([]);
  });
});
