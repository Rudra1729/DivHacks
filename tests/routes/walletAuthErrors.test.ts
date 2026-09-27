import express, { Express } from 'express';
import Database from 'better-sqlite3';
import request from 'supertest';
import { createSessionToken } from '../../src/auth/tokens';
import { openDatabase } from '../../src/db';
import { createUser } from '../../src/db/users';
import { createAuthRouter } from '../../src/routes/auth';
import { finalErrorHandler } from '../../src/routes/errorHandler';
import { createWalletRouter } from '../../src/routes/wallet';
import { XrplService } from '../../src/xrpl/types';

jest.mock('../../src/integrations/solana', () => ({
  getStamps: jest.fn(),
}));

import { getStamps } from '../../src/integrations/solana';

const WALLETS = {
  xrplAddress: 'rXRPLADDRESS',
  xrplSecretEncrypted: 'iv:tag:cipher',
  solanaAddress: 'SoLANAaddress',
  solanaSecretEncrypted: 'iv:tag:cipher2',
};

describe('wallet and login routes when something they depend on fails', () => {
  const originalSecret = process.env.SESSION_SECRET;
  let logged: jest.SpyInstance;

  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-session-secret';
  });
  afterAll(() => {
    process.env.SESSION_SECRET = originalSecret;
  });
  beforeEach(() => {
    logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => logged.mockRestore());

  function walletApp(getRlusdBalance: XrplService['getRlusdBalance']): { app: Express; token: string } {
    const db = openDatabase(':memory:');
    const xrpl: XrplService = {
      sendPayment: jest.fn(),
      getPaidToday: jest.fn(),
      getAgentAddress: () => 'rAgent',
      getRlusdBalance,
    };
    const app = express();
    app.use(express.json());
    app.use(createWalletRouter(db, xrpl));
    app.use(finalErrorHandler);
    const user = createUser(db, 'person@example.com', WALLETS);
    return { app, token: createSessionToken(user.id) };
  }

  it('GET /me/rlusd-balance answers 500 with a safe message when the ledger cannot be read', async () => {
    const { app, token } = walletApp(jest.fn().mockRejectedValue(new Error('testnet websocket closed')));

    const response = await request(app).get('/me/rlusd-balance').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain('websocket');
  });

  it('GET /me/rlusd-balance works again once the ledger is back', async () => {
    const { app, token } = walletApp(jest.fn().mockRejectedValueOnce(new Error('blip')).mockResolvedValue(4.5));

    const failed = await request(app).get('/me/rlusd-balance').set('Authorization', `Bearer ${token}`);
    const recovered = await request(app).get('/me/rlusd-balance').set('Authorization', `Bearer ${token}`);

    expect(failed.status).toBe(500);
    expect(recovered.status).toBe(200);
    expect(recovered.body.balance).toBe(4.5);
  });

  it('GET /me/nft answers 500 with a safe message when Solana cannot be read', async () => {
    (getStamps as jest.Mock).mockRejectedValue(new Error('solana rpc unreachable'));
    const { app, token } = walletApp(jest.fn());

    const response = await request(app).get('/me/nft').set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(500);
    expect(JSON.stringify(response.body)).not.toContain('solana rpc unreachable');
  });

  it('POST /auth/request-code answers 500 instead of hanging when the database fails', async () => {
    const db: Database.Database = openDatabase(':memory:');
    const app = express();
    app.use(express.json());
    app.use(createAuthRouter(db, { sendOtp: jest.fn() }));
    app.use(finalErrorHandler);
    db.close();

    const response = await request(app).post('/auth/request-code').send({ email: 'person@example.com' });

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual(expect.any(String));
  });

  it('POST /auth/request-code still answers 502 when the email cannot be sent, as before', async () => {
    const db = openDatabase(':memory:');
    const app = express();
    app.use(express.json());
    app.use(createAuthRouter(db, { sendOtp: jest.fn().mockRejectedValue(new Error('smtp down')) }));
    app.use(finalErrorHandler);

    const response = await request(app).post('/auth/request-code').send({ email: 'person@example.com' });

    expect(response.status).toBe(502);
  });
});
