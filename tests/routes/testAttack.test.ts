import request from 'supertest';
import { isPolicyBypassEnabled, disablePolicyBypass } from '../../src/testMode/attackFlag';
import { buildTestApp } from '../testHelpers/buildTestApp';

describe('POST /test/attack', () => {
  afterEach(() => {
    disablePolicyBypass();
  });

  it('is unreachable outside test mode', async () => {
    const { app } = buildTestApp({ isTestMode: false });
    const response = await request(app).post('/test/attack');
    expect(response.status).toBe(404);
  });

  it('enables the policy bypass flag in test mode', async () => {
    const { app } = buildTestApp({ isTestMode: true });
    expect(isPolicyBypassEnabled()).toBe(false);

    const response = await request(app).post('/test/attack');
    expect(response.status).toBe(200);
    expect(isPolicyBypassEnabled()).toBe(true);
  });
});
