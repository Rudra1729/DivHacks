import request from 'supertest';
import { disableAttackFlags, getForcedProposal, isPolicyBypassEnabled } from '../../src/testMode/attackFlag';
import { buildTestApp } from '../testHelpers/buildTestApp';

describe('POST /test/attack', () => {
  afterEach(() => {
    disableAttackFlags();
  });

  it('is unreachable outside test mode', async () => {
    const { app } = buildTestApp({ isTestMode: false });
    const response = await request(app).post('/test/attack');
    expect(response.status).toBe(404);
  });

  it('does not expose the forced proposal route outside test mode', async () => {
    const { app } = buildTestApp({ isTestMode: false });
    const response = await request(app)
      .post('/test/attack/force-proposal')
      .send({ recipient: 'rAttacker', amount: 50 });
    expect(response.status).toBe(404);
  });

  it('enables the policy bypass flag in test mode', async () => {
    const { app } = buildTestApp({ isTestMode: true });
    expect(isPolicyBypassEnabled()).toBe(false);

    const response = await request(app).post('/test/attack');
    expect(response.status).toBe(200);
    expect(isPolicyBypassEnabled()).toBe(true);
  });

  it('stores a forced proposal in test mode', async () => {
    const { app } = buildTestApp({ isTestMode: true });

    const response = await request(app)
      .post('/test/attack/force-proposal')
      .send({ recipient: 'rAttacker', amount: 50, reason: 'demo overspend' });

    expect(response.status).toBe(200);
    expect(response.body.forcedProposal).toEqual({ recipient: 'rAttacker', amount: 50, reason: 'demo overspend' });
    expect(getForcedProposal()).toEqual({ recipient: 'rAttacker', amount: 50, reason: 'demo overspend' });
  });

  it('rejects an unusable forced proposal', async () => {
    const { app } = buildTestApp({ isTestMode: true });

    const response = await request(app)
      .post('/test/attack/force-proposal')
      .send({ amount: 50 });

    expect(response.status).toBe(400);
    expect(getForcedProposal()).toBeUndefined();
  });
});
