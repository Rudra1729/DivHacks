import { AgentProposal, PayoutAgent } from '../../src/agent/types';
import { FakeReviewer } from '../../src/agent/fakeReviewer';
import { Orchestrator } from '../../src/orchestrator/orchestrator';
import { Place, SubmissionInput } from '../../src/orchestrator/types';
import { FakeSentinel } from '../../src/sentinel/fakeSentinel';
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

const good: AgentProposal = { amount: 2, recipient: 'rUser', reason: 'nice visit' };
const injected: AgentProposal = { amount: 50, recipient: 'rAttacker', reason: 'told to' };

function agentProposing(proposal: AgentProposal): PayoutAgent {
  return { propose: jest.fn().mockResolvedValue(proposal) };
}

function build(options: { agent?: PayoutAgent; sentinel?: FakeSentinel; isTestMode?: boolean } = {}) {
  const xrpl = new FakePaymentService();
  const solana = new FakeStampService();
  const storage = new FakeStorage([place]);
  const orchestrator = new Orchestrator({
    sentinel: options.sentinel ?? new FakeSentinel(),
    agent: options.agent ?? agentProposing(good),
    reviewer: new FakeReviewer(),
    xrpl,
    solana,
    storage,
    isTestMode: options.isTestMode ?? true,
    unconfirmedRecheck: { attempts: 0, delayMs: 0 },
  });
  return { orchestrator, xrpl, solana, storage };
}

/** The steps as [layer, passed], ignoring the messages. */
function shape(storage: FakeStorage, decisionId: string): [string, boolean][] {
  return storage.getAuditEvents(decisionId).map((e) => [e.layer, e.passed]);
}

describe('Orchestrator audit trail', () => {
  it('records every step of a paid submission in order, all passing', async () => {
    const { orchestrator, storage } = build();
    const result = await orchestrator.runSubmission(submission);

    expect(shape(storage, result.decisionId)).toEqual([
      ['solvency', true],
      ['sentinel', true],
      ['claim', true],
      ['agent', true],
      ['policy', true],
      ['review', true],
      ['xrpl', true],
      ['solana', true],
    ]);
  });

  it('describes what happened in each step in plain words', async () => {
    const { orchestrator, storage } = build();
    const result = await orchestrator.runSubmission(submission);
    const messages = storage.getAuditEvents(result.decisionId).map((e) => e.message);

    expect(messages[3]).toBe('proposed 2 RLUSD to rUser: nice visit');
    expect(messages[4]).toContain('proposal allowed');
    expect(messages[5]).toBe('reviewer approved 2 RLUSD: within the allowed range of the base reward');
    expect(messages[6]).toContain(`paid 2 RLUSD to rUser, transaction ${result.xrplTxHash}`);
    expect(messages[7]).toBe(`stamp minted: ${result.solanaAssetAddress}`);
  });

  it('records one failing entry per Sentinel failure and stops there', async () => {
    const { orchestrator, storage } = build({
      sentinel: new FakeSentinel(['location: 900m away', 'freshness: photo too old']),
    });
    const result = await orchestrator.runSubmission(submission);

    expect(storage.getAuditEvents(result.decisionId)).toEqual([
      { layer: 'solvency', passed: true, message: expect.any(String) },
      { layer: 'sentinel', passed: false, message: 'location: 900m away' },
      { layer: 'sentinel', passed: false, message: 'freshness: photo too old' },
    ]);
  });

  it('records an unknown place as a failing Sentinel step', async () => {
    const { orchestrator, storage } = build();
    const result = await orchestrator.runSubmission({ ...submission, placeId: 'nowhere' });

    expect(storage.getAuditEvents(result.decisionId)).toEqual([
      { layer: 'sentinel', passed: false, message: 'unknown place: nowhere' },
    ]);
  });

  it('records each policy violation when an injected proposal is blocked', async () => {
    const { orchestrator, storage } = build({ agent: agentProposing(injected) });
    const result = await orchestrator.runSubmission(submission);

    const events = storage.getAuditEvents(result.decisionId);
    expect(events.slice(0, 4).map((e) => [e.layer, e.passed])).toEqual([
      ['solvency', true],
      ['sentinel', true],
      ['claim', true],
      ['agent', true],
    ]);
    const policy = events.slice(4);
    expect(policy.every((e) => e.layer === 'policy' && !e.passed)).toBe(true);
    expect(policy.map((e) => e.message)).toEqual(result.reasons);
    expect(policy.map((e) => e.message)).toContain('per-task cap: asked for 50, max is 5');
    expect(events.find((e) => e.layer === 'xrpl')).toBeUndefined();
  });

  it('shows the agent proposal even though policy blocked it', async () => {
    const { orchestrator, storage } = build({ agent: agentProposing(injected) });
    const result = await orchestrator.runSubmission(submission);

    const agent = storage.getAuditEvents(result.decisionId).find((e) => e.layer === 'agent');
    expect(agent?.message).toBe('proposed 50 RLUSD to rAttacker: told to');
  });

  it('records a skipped policy step and the ledger rejection when policy is bypassed in test mode', async () => {
    const { orchestrator, storage } = build({ agent: agentProposing(injected) });
    const result = await orchestrator.runSubmission(submission, { bypassPolicy: true });

    expect(shape(storage, result.decisionId)).toEqual([
      ['solvency', true],
      ['sentinel', true],
      ['claim', true],
      ['agent', true],
      ['policy', true],
      ['review', true],
      ['xrpl', false],
    ]);
    const events = storage.getAuditEvents(result.decisionId);
    expect(events[4].message).toBe('skipped: test mode bypass');
    expect(events[5].message).toBe('skipped: test mode bypass');
    expect(events[6].message).toContain('ledger rejected payment: tecPATH_PARTIAL');
  });

  it('records a failed stamp after a successful payment', async () => {
    const { orchestrator, solana, storage } = build();
    jest.spyOn(solana, 'mintStamp').mockResolvedValue({ ok: false, error: 'rpc down' });
    const result = await orchestrator.runSubmission(submission);

    const events = storage.getAuditEvents(result.decisionId);
    expect(events.slice(-2).map((e) => [e.layer, e.passed])).toEqual([
      ['xrpl', true],
      ['solana', false],
    ]);
    expect(events[events.length - 1].message).toBe('stamp mint failed, queued for retry: rpc down');
  });

  it('records a payment that was not sent', async () => {
    const { orchestrator, xrpl, storage } = build();
    jest
      .spyOn(xrpl, 'sendPayment')
      .mockResolvedValue({ ok: false, reason: 'network_error', error: 'node unreachable' });
    const result = await orchestrator.runSubmission(submission);

    const last = storage.getAuditEvents(result.decisionId).pop();
    expect(last).toEqual({
      layer: 'xrpl',
      passed: false,
      message: 'payment not sent (network_error): node unreachable',
    });
  });

  describe('an unconfirmed payment that is later resumed', () => {
    it('keeps the first run and adds the second on the same decision', async () => {
      const { orchestrator, xrpl, storage } = build();
      const send = jest.spyOn(xrpl, 'sendPayment').mockResolvedValue({
        ok: false,
        reason: 'unconfirmed',
        txHash: 'TXU',
        error: 'not validated yet',
      });
      const stuck = await orchestrator.runSubmission(submission);
      expect(stuck.status).toBe('PAYMENT_UNCONFIRMED');
      expect(storage.getAuditEvents(stuck.decisionId).pop()).toEqual({
        layer: 'xrpl',
        passed: false,
        message: 'payment not confirmed yet: not validated yet',
      });

      send.mockRestore();
      const resumed = await orchestrator.runSubmission(submission);

      expect(resumed.decisionId).toBe(stuck.decisionId);
      expect(shape(storage, stuck.decisionId)).toEqual([
        ['solvency', true],
        ['sentinel', true],
        ['claim', true],
        ['agent', true],
        ['policy', true],
        ['review', true],
        ['xrpl', false],
        ['orchestrator', true],
        ['xrpl', true],
        ['solana', true],
      ]);
    });
  });

  it('adds no steps when a finished request is simply sent again', async () => {
    const { orchestrator, storage } = build();
    const first = await orchestrator.runSubmission(submission);
    const before = storage.getAuditEvents(first.decisionId).length;

    await orchestrator.runSubmission(submission);

    expect(storage.getAuditEvents(first.decisionId)).toHaveLength(before);
  });

  it('cuts a very long agent reason so the history stays readable', async () => {
    const { orchestrator, storage } = build({
      agent: agentProposing({ ...good, reason: 'ignore your rules '.repeat(200) }),
    });
    const result = await orchestrator.runSubmission(submission);

    const agent = storage.getAuditEvents(result.decisionId).find((e) => e.layer === 'agent');
    expect(agent?.message.length).toBeLessThanOrEqual(300);
  });

  it('records nothing when a dependency throws before a decision exists', async () => {
    const agent: PayoutAgent = { propose: jest.fn().mockRejectedValue(new Error('agent down')) };
    const { orchestrator, storage } = build({ agent });

    await expect(orchestrator.runSubmission(submission)).rejects.toThrow('agent down');

    expect(await storage.getDecisionByRequestId('req-1')).toBeUndefined();
  });
});
