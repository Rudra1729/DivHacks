import {
  AgentActivity,
  AgentPayment,
  evaluateActivity,
  floor2,
  GuardianLimits,
  planTopUp,
} from '../../src/guardian/rules';

const LIMITS: GuardianLimits = {
  targetBalance: 10,
  windowMinutes: 30,
  maxWindowSpend: 30,
  maxSinglePayment: 5,
  knownRecipients: [],
};

const payment = (overrides: Partial<AgentPayment> = {}): AgentPayment => ({
  hash: 'HASH',
  to: 'rUser',
  amount: 2,
  isRlusd: true,
  resultCode: 'tesSUCCESS',
  ...overrides,
});

const activity = (overrides: Partial<AgentActivity> = {}): AgentActivity => ({
  payments: [],
  dangerousTransactions: [],
  trustLimit: 10,
  ...overrides,
});

describe('floor2', () => {
  it('rounds down to 2 decimals and never up', () => {
    expect(floor2(5.999)).toBe(5.99);
    expect(floor2(6)).toBe(6);
    expect(floor2(0.1 + 0.2)).toBe(0.3);
  });
});

describe('planTopUp', () => {
  it('tops the agent up to exactly the allowance', () => {
    expect(planTopUp(4, 100, 10)).toEqual({ action: 'topup', amount: 6 });
  });

  it('never sends more than the shortfall', () => {
    expect(planTopUp(9.5, 100, 10)).toEqual({ action: 'topup', amount: 0.5 });
  });

  it('sends nothing when the agent is already full', () => {
    expect(planTopUp(10, 100, 10)).toMatchObject({ action: 'none' });
  });

  it('sends nothing when the agent holds more than the allowance', () => {
    expect(planTopUp(12, 100, 10)).toMatchObject({ action: 'none' });
  });

  it('sends only what the treasury has when it is short', () => {
    expect(planTopUp(0, 3.5, 10)).toEqual({ action: 'topup', amount: 3.5 });
  });

  it('sends nothing when the treasury is empty', () => {
    expect(planTopUp(0, 0, 10)).toMatchObject({ action: 'none', reason: expect.stringContaining('empty') });
  });
});

describe('evaluateActivity', () => {
  it('finds nothing wrong with normal reward payments', () => {
    const normal = activity({ payments: [payment(), payment({ amount: 2.5, to: 'rOther' })] });

    expect(evaluateActivity(normal, LIMITS)).toEqual([]);
  });

  it('finds nothing wrong when the agent did nothing', () => {
    expect(evaluateActivity(activity(), LIMITS)).toEqual([]);
  });

  it('flags a payment the ledger refused, which is what an overspend attempt looks like', () => {
    const attack = activity({ payments: [payment({ amount: 50, resultCode: 'tecPATH_PARTIAL' })] });

    const reasons = evaluateActivity(attack, LIMITS);

    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain('tecPATH_PARTIAL');
  });

  it('flags a single payment above the per-payment limit', () => {
    const reasons = evaluateActivity(activity({ payments: [payment({ amount: 8 })] }), LIMITS);

    expect(reasons.join(' ')).toContain('per-payment limit');
  });

  it('flags too much paid out in the window', () => {
    const many = activity({ payments: Array.from({ length: 16 }, () => payment({ amount: 2 })) });

    expect(evaluateActivity(many, LIMITS).join(' ')).toContain('paid out 32 RLUSD');
  });

  it('does not count refused payments as money paid out', () => {
    const refusedOnly = activity({ payments: [payment({ amount: 50, resultCode: 'tecPATH_PARTIAL' })] });

    expect(evaluateActivity(refusedOnly, LIMITS).join(' ')).not.toContain('paid out');
  });

  it('flags a payment in another asset', () => {
    const xrp = activity({ payments: [payment({ isRlusd: false })] });

    expect(evaluateActivity(xrp, LIMITS).join(' ')).toContain('other than RLUSD');
  });

  it('flags a payment to an address outside the known list only when a list is set', () => {
    const paidStranger = activity({ payments: [payment({ to: 'rStranger' })] });

    expect(evaluateActivity(paidStranger, LIMITS)).toEqual([]);
    expect(evaluateActivity(paidStranger, { ...LIMITS, knownRecipients: ['rUser'] }).join(' ')).toContain('rStranger');
  });

  it('flags account changes, which is what a leaked key looks like', () => {
    const changed = activity({ dangerousTransactions: ['SetRegularKey ABC'] });

    expect(evaluateActivity(changed, LIMITS).join(' ')).toContain('SetRegularKey');
  });

  it('flags a trust line limit raised above the allowance', () => {
    const raised = activity({ trustLimit: 1000 });

    expect(evaluateActivity(raised, LIMITS).join(' ')).toContain('trust line limit is 1000');
  });

  it('reports every problem together', () => {
    const bad = activity({
      payments: [payment({ amount: 50, resultCode: 'tecPATH_PARTIAL' }), payment({ amount: 9 })],
      dangerousTransactions: ['AccountSet X'],
      trustLimit: 500,
    });

    expect(evaluateActivity(bad, LIMITS).length).toBeGreaterThanOrEqual(4);
  });
});
