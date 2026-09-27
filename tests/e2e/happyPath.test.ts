import request from 'supertest';
import { buildE2eStack, E2eStack, makeUser, place, resetGlobalTestState, submit } from './harness';

describe('e2e: happy path', () => {
  let stack: E2eStack;

  beforeEach(() => {
    stack = buildE2eStack();
  });
  afterEach(resetGlobalTestState);

  it('pays RLUSD and mints a stamp, with the same decision ID on every record', async () => {
    const user = makeUser(1);
    const apollo = place(0);

    const response = await submit(stack.app, user, apollo);

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('OK');
    const { decisionId, xrplTxHash, solanaAssetAddress } = response.body;
    expect(decisionId).toBeTruthy();
    expect(xrplTxHash).toBeTruthy();
    expect(solanaAssetAddress).toBeTruthy();
    expect(response.body).toMatchObject({ stampSerial: 1, stampTier: 'Legendary' });

    // Money moved: the user got the place's base reward from the agent wallet.
    expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(apollo.baseRewardRlusd);
    expect(await stack.xrpl.getRlusdBalance(stack.xrpl.getAgentAddress())).toBe(
      10 - apollo.baseRewardRlusd
    );

    // Solana: the stamp carries the same decision ID and the XRPL payment hash.
    const stamps = await stack.solana.getStamps(user.solana);
    expect(stamps).toHaveLength(1);
    expect(stamps[0]).toMatchObject({ placeId: apollo.id, decisionId, xrplTxHash, serial: 1, tier: 'Legendary' });

    // SQLite: one saved decision under the same ID, linking both chains.
    const saved = await request(stack.app).get(`/decisions/${decisionId}`);
    expect(saved.status).toBe(200);
    expect(saved.body.decision).toMatchObject({
      id: decisionId,
      status: 'OK',
      xrplHash: xrplTxHash,
      solanaAsset: solanaAssetAddress,
      stampSerial: 1,
      stampTier: 'Legendary',
      stampFailed: false,
    });
  });

  it('gives the second finder of a place the next serial', async () => {
    await submit(stack.app, makeUser(1), place(0));
    const second = await submit(stack.app, makeUser(2), place(0));

    expect(second.body).toMatchObject({ status: 'OK', stampSerial: 2, stampTier: 'Legendary' });
  });

  it('records the policy version and the agent proposal on the decision', async () => {
    const response = await submit(stack.app, makeUser(2), place(1));

    expect(response.body.policyVersion).toBeTruthy();
    expect(response.body.proposal).toMatchObject({
      amount: place(1).baseRewardRlusd,
      reason: 'base reward',
    });
  });
});
