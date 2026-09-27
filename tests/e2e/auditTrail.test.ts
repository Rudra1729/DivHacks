import request from 'supertest';
import { subscribeToEvents, WebPassEvent } from '../../src/events/bus';
import { ATTACKER, buildE2eStack, E2eStack, makeUser, place, resetGlobalTestState, submit } from './harness';

interface HistoryEntry {
  layer: string;
  passed: boolean;
  message: string;
  createdAt: string;
}

/** Fetch a decision's history the way a client would. */
async function historyOf(stack: E2eStack, decisionId: string): Promise<HistoryEntry[]> {
  const response = await request(stack.app).get(`/decisions/${decisionId}`);
  expect(response.status).toBe(200);
  return response.body.history;
}

function shape(history: HistoryEntry[]): [string, boolean][] {
  return history.map((e) => [e.layer, e.passed]);
}

describe('e2e: audit trail', () => {
  let stack: E2eStack;

  beforeEach(() => {
    stack = buildE2eStack();
  });
  afterEach(resetGlobalTestState);

  it('shows every step of a paid submission through GET /decisions/:id', async () => {
    const response = await submit(stack.app, makeUser(1), place(0));
    expect(response.body.status).toBe('OK');

    const history = await historyOf(stack, response.body.decisionId);

    expect(shape(history)).toEqual([
      ['solvency', true],
      ['sentinel', true],
      ['claim', true],
      ['agent', true],
      ['policy', true],
      ['review', true],
      ['xrpl', true],
      ['solana', true],
    ]);
    // Same transaction and stamp as the decision, so the trail links to both chains.
    expect(history[6].message).toContain(response.body.xrplTxHash);
    expect(history[7].message).toContain(response.body.solanaAssetAddress);
    history.forEach((entry) => expect(Date.parse(entry.createdAt)).not.toBeNaN());
  });

  it('shows why an injected caption was blocked, and that nothing was paid', async () => {
    const response = await submit(stack.app, makeUser(2), place(0), { caption: 'ATTACK' });
    expect(response.body.status).toBe('BLOCKED_POLICY');

    const history = await historyOf(stack, response.body.decisionId);

    expect(history.map((e) => e.layer)).not.toContain('xrpl');
    const blocks = history.filter((e) => !e.passed);
    expect(blocks.every((e) => e.layer === 'policy')).toBe(true);
    expect(blocks.map((e) => e.message)).toEqual(
      expect.arrayContaining([
        'per-task cap: asked for 50, max is 5',
        expect.stringContaining('recipient mismatch'),
      ])
    );
    expect(history.find((e) => e.layer === 'agent')?.message).toContain(ATTACKER.xrpl);
  });

  it('shows the skipped policy step and the ledger stopping the bypass attack', async () => {
    await request(stack.app).post('/test/attack').expect(200);

    const response = await submit(stack.app, makeUser(3), place(0), { caption: 'ATTACK' });
    expect(response.body.status).toBe('REJECTED_BY_LEDGER');

    const history = await historyOf(stack, response.body.decisionId);

    expect(shape(history)).toEqual([
      ['solvency', true],
      ['sentinel', true],
      ['claim', true],
      ['agent', true],
      ['policy', true],
      ['review', true],
      ['xrpl', false],
    ]);
    expect(history[4].message).toBe('skipped: test mode bypass');
    expect(history[5].message).toBe('skipped: test mode bypass');
    expect(history[6].message).toContain('tecPATH_PARTIAL');
  });

  it('shows a Sentinel block with one entry per failed check', async () => {
    const response = await submit(stack.app, makeUser(4), { ...place(0), latitude: 40.7, longitude: -74.0 });
    expect(response.body.status).toBe('BLOCKED_SENTINEL');

    const history = await historyOf(stack, response.body.decisionId);

    // The solvency step passed first, then one failing entry per Sentinel check.
    expect(history[0]).toMatchObject({ layer: 'solvency', passed: true });
    const blocks = history.slice(1);
    expect(blocks).toHaveLength(response.body.reasons.length);
    expect(blocks.every((e) => e.layer === 'sentinel' && !e.passed)).toBe(true);
    expect(blocks.map((e) => e.message)).toEqual(response.body.reasons);
  });

  it('shows a failed stamp after a successful payment', async () => {
    stack.solana.setFailMints(true);

    const response = await submit(stack.app, makeUser(5), place(0));
    expect(response.body.status).toBe('STAMP_FAILED');

    const history = await historyOf(stack, response.body.decisionId);

    expect(shape(history).slice(-2)).toEqual([
      ['xrpl', true],
      ['solana', false],
    ]);
  });

  it('keeps each decision history separate', async () => {
    const a = await submit(stack.app, makeUser(6), place(0));
    const b = await submit(stack.app, makeUser(7), place(0), { caption: 'ATTACK' });

    const historyA = await historyOf(stack, a.body.decisionId);
    const historyB = await historyOf(stack, b.body.decisionId);

    expect(historyA.every((e) => e.passed)).toBe(true);
    expect(historyB.some((e) => !e.passed)).toBe(true);
  });

  it('streams each step on the live event feed as it is recorded', async () => {
    const heard: WebPassEvent[] = [];
    const unsubscribe = subscribeToEvents((event) => heard.push(event));

    const response = await submit(stack.app, makeUser(8), place(0));
    unsubscribe();

    const steps = heard.filter((e) => e.type.startsWith('audit.') && e.decisionId === response.body.decisionId);
    expect(steps.map((e) => e.type)).toEqual([
      'audit.solvency',
      'audit.sentinel',
      'audit.claim',
      'audit.agent',
      'audit.policy',
      'audit.review',
      'audit.xrpl',
      'audit.solana',
    ]);
  });

  it('returns 404 for a decision that does not exist', async () => {
    await request(stack.app).get('/decisions/does-not-exist').expect(404);
  });
});
