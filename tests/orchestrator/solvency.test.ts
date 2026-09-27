import { PayoutAgent } from '../../src/agent/types';
import { FakeReviewer } from '../../src/agent/fakeReviewer';
import { Orchestrator } from '../../src/orchestrator/orchestrator';
import { Place, SubmissionInput } from '../../src/orchestrator/types';
import { FakeSentinel } from '../../src/sentinel/fakeSentinel';
import { Sentinel } from '../../src/sentinel/types';
import { FakeStampService } from '../../src/solana/fakeStamps';
import { FakeStorage } from '../../src/storage/fakeStorage';
import { FakePaymentService } from '../../src/xrpl/fakePayments';

const place: Place = {
  id: 'apollo',
  name: 'Apollo Theater',
  neighborhood: 'Harlem',
  latitude: 40.81,
  longitude: -73.95,
  radiusMeters: 150,
  baseReward: 2,
  collectionAddress: 'collection1',
  imageUrl: 'https://example.com/apollo.png',
};

const submission: SubmissionInput = {
  requestId: 'req-1',
  placeId: 'apollo',
  photo: Buffer.from('photo'),
  latitude: 40.81,
  longitude: -73.95,
  timestamp: Date.now(),
  xrplAddress: 'rUser',
  solanaAddress: 'solUser',
};

/** A fake ledger whose agent wallet holds only `left` RLUSD. */
async function ledgerWithAgentBalance(left: number): Promise<FakePaymentService> {
  const xrpl = new FakePaymentService();
  const drained = 10 - left;
  if (drained > 0) {
    await xrpl.sendPayment({ decisionId: 'drain', recipient: 'rSomeoneElse', amount: drained });
  }
  return xrpl;
}

function build(options: { xrpl: FakePaymentService; rewardScale?: number; sentinel?: Sentinel }) {
  const solana = new FakeStampService();
  const storage = new FakeStorage([place]);
  const agent: PayoutAgent & { propose: jest.Mock } = {
    propose: jest.fn().mockResolvedValue({ amount: 2, recipient: 'rUser', reason: 'nice visit' }),
  };
  const sentinel = options.sentinel ?? new FakeSentinel();
  const verify = jest.spyOn(sentinel, 'verify');
  const orchestrator = new Orchestrator({
    sentinel,
    agent,
    reviewer: new FakeReviewer(),
    xrpl: options.xrpl,
    solana,
    storage,
    isTestMode: false,
    rewardScale: options.rewardScale,
    unconfirmedRecheck: { attempts: 0, delayMs: 0 },
  });
  return { orchestrator, storage, agent, verify, solana, xrpl: options.xrpl };
}

describe('Orchestrator solvency gate', () => {
  it('stops with BLOCKED_SOLVENCY when the agent wallet cannot cover the place reward', async () => {
    const { orchestrator, agent, xrpl } = build({ xrpl: await ledgerWithAgentBalance(1.5) });

    const result = await orchestrator.runSubmission(submission);

    expect(result.status).toBe('BLOCKED_SOLVENCY');
    expect(result.reasons).toEqual([expect.stringContaining('1.5 RLUSD')]);
    expect(result.reasons[0]).toContain('2 RLUSD');
    expect(result.reasons[0]).toContain('try again later');
    expect(result.proposal).toBeUndefined();
    expect(agent.propose).not.toHaveBeenCalled();
    expect(await xrpl.getRlusdBalance('rUser')).toBe(0);
  });

  it('runs before Sentinel, so a blocked visitor keeps their photo', async () => {
    const { orchestrator, verify } = build({ xrpl: await ledgerWithAgentBalance(0) });

    await orchestrator.runSubmission(submission);

    expect(verify).not.toHaveBeenCalled();
  });

  it('leaves no claim behind, pending or otherwise', async () => {
    const { orchestrator, storage } = build({ xrpl: await ledgerWithAgentBalance(0) });

    await orchestrator.runSubmission(submission);

    expect(storage.getClaims()).toHaveLength(0);
  });

  it('saves the decision and writes a solvency line in the audit trail', async () => {
    const { orchestrator, storage } = build({ xrpl: await ledgerWithAgentBalance(0.5) });

    const result = await orchestrator.runSubmission(submission);

    expect(await storage.getDecisionByRequestId('req-1')).toEqual(result);
    expect(storage.getAuditEvents(result.decisionId)).toEqual([
      { layer: 'solvency', passed: false, message: expect.stringContaining('0.5 RLUSD') },
    ]);
  });

  it('passes when the balance exactly covers the reward', async () => {
    const { orchestrator, storage } = build({ xrpl: await ledgerWithAgentBalance(2) });

    const result = await orchestrator.runSubmission(submission);

    expect(result.status).toBe('OK');
    const [first] = storage.getAuditEvents(result.decisionId);
    expect(first).toEqual({ layer: 'solvency', passed: true, message: expect.stringContaining('2 RLUSD') });
  });

  it('checks the scaled reward, since that is what the visitor is actually promised', async () => {
    const { orchestrator } = build({ xrpl: await ledgerWithAgentBalance(0.05), rewardScale: 0.01 });

    const result = await orchestrator.runSubmission(submission);

    // 2 RLUSD x 0.01 = 0.02 RLUSD, which 0.05 covers.
    expect(result.status).not.toBe('BLOCKED_SOLVENCY');
  });

  it('fails closed when the balance cannot be read, and does not leak the error', async () => {
    const xrpl = new FakePaymentService();
    jest.spyOn(xrpl, 'getRlusdBalance').mockRejectedValue(new Error('wss://secret-node.example dropped'));
    const { orchestrator, storage, agent, verify } = build({ xrpl });

    const result = await orchestrator.runSubmission(submission);

    expect(result.status).toBe('BLOCKED_SOLVENCY');
    expect(result.reasons[0]).toContain('could not read');
    expect(JSON.stringify(result)).not.toContain('secret-node');
    expect(agent.propose).not.toHaveBeenCalled();
    expect(verify).not.toHaveBeenCalled();
    expect(storage.getClaims()).toHaveLength(0);
    const [entry] = storage.getAuditEvents(result.decisionId);
    expect(entry).toMatchObject({ layer: 'solvency', passed: false });
  });

  it('lets the same request go through once the wallet is topped up', async () => {
    const xrpl = await ledgerWithAgentBalance(0);
    const { orchestrator, storage } = build({ xrpl });

    const blocked = await orchestrator.runSubmission(submission);
    expect(blocked.status).toBe('BLOCKED_SOLVENCY');

    xrpl.reset();
    const retried = await orchestrator.runSubmission(submission);

    expect(retried.status).toBe('OK');
    expect(retried.decisionId).toBe(blocked.decisionId);
    expect(storage.getAuditEvents(retried.decisionId).map((e) => e.layer)).toEqual(
      expect.arrayContaining(['solvency', 'sentinel', 'xrpl', 'solana'])
    );
  });

  it('still returns the earlier answer for a repeated request that was blocked for another reason', async () => {
    const { orchestrator, verify } = build({
      xrpl: new FakePaymentService(),
      sentinel: new FakeSentinel(['too far from place']),
    });

    const first = await orchestrator.runSubmission(submission);
    const second = await orchestrator.runSubmission(submission);

    expect(second).toEqual(first);
    expect(verify).toHaveBeenCalledTimes(1);
  });
});
