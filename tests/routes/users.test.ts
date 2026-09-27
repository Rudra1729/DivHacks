import request from 'supertest';
import { createApp } from '../../src/app';
import { loadConfig } from '../../src/config';
import { openDatabase } from '../../src/db';

describe('GET /users/:wallet/stamps', () => {
  it('returns the stamps list from the Solana integration', async () => {
    const app = createApp(loadConfig(), openDatabase(':memory:'));
    const response = await request(app).get('/users/someSolanaWallet/stamps');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.stamps)).toBe(true);
  });
});
