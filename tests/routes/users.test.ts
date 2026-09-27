import request from 'supertest';
import { buildTestApp } from '../testHelpers/buildTestApp';

describe('GET /users/:wallet/stamps', () => {
  it('returns the stamps list from the Solana integration', async () => {
    const { app } = buildTestApp();
    const response = await request(app).get('/users/someSolanaWallet/stamps');
    expect(response.status).toBe(200);
    expect(Array.isArray(response.body.stamps)).toBe(true);
  });
});
