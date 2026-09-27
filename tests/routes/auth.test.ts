import express, { Express } from 'express';
import Database from 'better-sqlite3';
import request from 'supertest';
import { openDatabase } from '../../src/db';
import { createAuthRouter } from '../../src/routes/auth';
import { FakeEmailSender } from '../../src/auth/email';

function buildAuthTestApp(): { app: Express; db: Database.Database; sender: FakeEmailSender } {
  const db = openDatabase(':memory:');
  const sender = new FakeEmailSender();
  const app = express();
  app.use(express.json());
  app.use(createAuthRouter(db, sender));
  return { app, db, sender };
}

describe('email OTP auth', () => {
  const originalSessionSecret = process.env.SESSION_SECRET;
  const originalEncryptionKey = process.env.WALLET_ENCRYPTION_KEY;

  beforeAll(() => {
    process.env.SESSION_SECRET = 'test-session-secret';
    process.env.WALLET_ENCRYPTION_KEY = 'test-wallet-encryption-key';
  });

  afterAll(() => {
    process.env.SESSION_SECRET = originalSessionSecret;
    process.env.WALLET_ENCRYPTION_KEY = originalEncryptionKey;
  });

  it('rejects an invalid email on request-code', async () => {
    const { app } = buildAuthTestApp();
    const response = await request(app).post('/auth/request-code').send({ email: 'not-an-email' });
    expect(response.status).toBe(400);
  });

  it('sends a code and logs in with it, provisioning wallets on first login', async () => {
    const { app, sender } = buildAuthTestApp();

    const requestResponse = await request(app).post('/auth/request-code').send({ email: 'person@example.com' });
    expect(requestResponse.status).toBe(200);
    expect(sender.sent).toHaveLength(1);

    const verifyResponse = await request(app)
      .post('/auth/verify')
      .send({ email: 'person@example.com', code: sender.sent[0].code });

    expect(verifyResponse.status).toBe(200);
    expect(verifyResponse.body.token).toBeTruthy();
    expect(verifyResponse.body.user.email).toBe('person@example.com');
    expect(verifyResponse.body.user.solanaAddress).toBeTruthy();
    expect(verifyResponse.body.user.xrplAddress).toBeTruthy();
  });

  it('reuses the same wallets on a second login instead of provisioning new ones', async () => {
    const { app, sender } = buildAuthTestApp();

    await request(app).post('/auth/request-code').send({ email: 'person@example.com' });
    const first = await request(app)
      .post('/auth/verify')
      .send({ email: 'person@example.com', code: sender.sent[0].code });

    await request(app).post('/auth/request-code').send({ email: 'person@example.com' });
    const second = await request(app)
      .post('/auth/verify')
      .send({ email: 'person@example.com', code: sender.sent[1].code });

    expect(second.body.user.solanaAddress).toBe(first.body.user.solanaAddress);
    expect(second.body.user.xrplAddress).toBe(first.body.user.xrplAddress);
    expect(second.body.user.id).toBe(first.body.user.id);
  });

  it('rejects a wrong code without consuming the real one', async () => {
    const { app, sender } = buildAuthTestApp();
    await request(app).post('/auth/request-code').send({ email: 'wrong@example.com' });

    const wrong = await request(app).post('/auth/verify').send({ email: 'wrong@example.com', code: '000000' });
    expect(wrong.status).toBe(400);

    const right = await request(app)
      .post('/auth/verify')
      .send({ email: 'wrong@example.com', code: sender.sent[0].code });
    expect(right.status).toBe(200);
  });

  it('locks out after too many wrong attempts', async () => {
    const { app } = buildAuthTestApp();
    await request(app).post('/auth/request-code').send({ email: 'lockout@example.com' });

    for (let i = 0; i < 5; i += 1) {
      await request(app).post('/auth/verify').send({ email: 'lockout@example.com', code: '000000' });
    }
    const response = await request(app).post('/auth/verify').send({ email: 'lockout@example.com', code: '000000' });
    expect(response.status).toBe(429);
  });

  it('rejects verify with no code requested yet', async () => {
    const { app } = buildAuthTestApp();
    const response = await request(app).post('/auth/verify').send({ email: 'nobody@example.com', code: '123456' });
    expect(response.status).toBe(400);
  });
});
