import request from 'supertest';
import { buildTestApp } from '../testHelpers/buildTestApp';

jest.mock('../../src/integrations/solana', () => ({
  getStamps: jest.fn(),
}));

import { getStamps } from '../../src/integrations/solana';

describe('GET /users/:wallet/stamps when Solana cannot be read', () => {
  let logged: jest.SpyInstance;

  beforeEach(() => {
    logged = jest.spyOn(console, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => logged.mockRestore());

  it('answers 500 with a safe message instead of hanging', async () => {
    (getStamps as jest.Mock).mockRejectedValue(new Error('rpc node unreachable'));
    const { app } = buildTestApp();

    const response = await request(app).get('/users/someWallet/stamps');

    expect(response.status).toBe(500);
    expect(response.body.error).toEqual(expect.any(String));
    expect(JSON.stringify(response.body)).not.toContain('rpc node unreachable');
  });

  it('keeps working once Solana is back', async () => {
    (getStamps as jest.Mock).mockRejectedValueOnce(new Error('blip')).mockResolvedValue([]);
    const { app } = buildTestApp();

    const failed = await request(app).get('/users/someWallet/stamps');
    const recovered = await request(app).get('/users/someWallet/stamps');

    expect(failed.status).toBe(500);
    expect(recovered.status).toBe(200);
    expect(recovered.body.stamps).toEqual([]);
  });
});
