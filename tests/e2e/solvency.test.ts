import request from 'supertest';
import { buildE2eStack, E2eStack, makeUser, place, resetGlobalTestState, submit } from './harness';

/** Leave the agent wallet holding only `left` RLUSD. */
async function drainAgentTo(stack: E2eStack, left: number): Promise<void> {
  await stack.xrpl.sendPayment({ decisionId: 'drain', recipient: 'rSomeoneElse', amount: 10 - left });
}

describe('e2e: solvency gate', () => {
  let stack: E2eStack;

  beforeEach(() => {
    stack = buildE2eStack();
  });
  afterEach(resetGlobalTestState);

  it('tells the visitor no reward can be promised when the agent wallet is empty', async () => {
    await drainAgentTo(stack, 0);
    const user = makeUser(1);

    const response = await submit(stack.app, user, place(0));

    expect(response.status).toBe(503);
    expect(response.body.status).toBe('BLOCKED_SOLVENCY');
    expect(response.body.reasons[0]).toContain('no reward can be promised');
    expect(response.body.xrplTxHash).toBeUndefined();
    expect(await stack.solana.getStamps(user.solana)).toEqual([]);
  });

  it('does not use up the visitor photo, so the same photo works after a top-up', async () => {
    await drainAgentTo(stack, 0);
    const user = makeUser(2);

    const blocked = await submit(stack.app, user, place(0), { photo: 'the-one-photo' });
    expect(blocked.body.status).toBe('BLOCKED_SOLVENCY');

    stack.xrpl.reset();
    const retry = await submit(stack.app, user, place(0), { photo: 'the-one-photo' });

    expect(retry.status).toBe(202);
    expect(retry.body.status).toBe('OK');
  });

  it('does not lock the visitor out of the place either', async () => {
    await drainAgentTo(stack, 0.5);
    const user = makeUser(3);

    const blocked = await submit(stack.app, user, place(0));
    expect(blocked.body.status).toBe('BLOCKED_SOLVENCY');
    const claims = stack.db.prepare('SELECT COUNT(*) AS n FROM claims').get() as { n: number };
    expect(claims.n).toBe(0);

    stack.xrpl.reset();
    const retry = await submit(stack.app, user, place(0));
    expect(retry.body.status).toBe('OK');
  });

  it('lets the same request ID try again after a top-up and keeps one decision ID', async () => {
    await drainAgentTo(stack, 0);
    const user = makeUser(4);

    const blocked = await submit(stack.app, user, place(0), { requestId: 'client-req-1', photo: 'p4' });
    stack.xrpl.reset();
    const retry = await submit(stack.app, user, place(0), { requestId: 'client-req-1', photo: 'p4' });

    expect(retry.body.status).toBe('OK');
    expect(retry.body.decisionId).toBe(blocked.body.decisionId);
    const history = await request(stack.app).get(`/decisions/${retry.body.decisionId}`);
    const layers: string[] = history.body.history.map((h: { layer: string }) => h.layer);
    expect(layers.filter((l) => l === 'solvency')).toHaveLength(2);
    expect(layers).toEqual(expect.arrayContaining(['sentinel', 'claim', 'agent', 'policy', 'xrpl', 'solana']));
  });

  it('shows the block in the saved decision history', async () => {
    await drainAgentTo(stack, 0);

    const blocked = await submit(stack.app, makeUser(5), place(0));

    const saved = await request(stack.app).get(`/decisions/${blocked.body.decisionId}`);
    expect(saved.body.decision.status).toBe('BLOCKED_SOLVENCY');
    expect(saved.body.history).toEqual([
      expect.objectContaining({ layer: 'solvency', passed: false }),
    ]);
  });
});
