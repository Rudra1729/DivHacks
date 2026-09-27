import { evaluatePolicy, POLICY_VERSION } from '../../src/policy/policy';
import { PolicyContext } from '../../src/policy/types';

const context: PolicyContext = {
  submitterXrplAddress: 'rUser',
  placeId: 'apollo',
  allowedPlaceIds: ['apollo', 'riverside'],
  dailyTotal: 0,
};

function propose(amount: number, recipient = 'rUser') {
  return { amount, recipient, reason: 'test' };
}

function violationsOf(result: ReturnType<typeof evaluatePolicy>): string[] {
  return result.ok ? [] : result.violations;
}

describe('evaluatePolicy', () => {
  it('passes a valid proposal and reports the policy version', () => {
    expect(evaluatePolicy(propose(2), context)).toEqual({ ok: true, policyVersion: POLICY_VERSION });
  });

  it('accepts the exact per-task cap', () => {
    expect(evaluatePolicy(propose(5), context).ok).toBe(true);
  });

  describe('amount bounds', () => {
    it('rejects an amount over the per-task cap in plain words', () => {
      const result = evaluatePolicy(propose(50), context);
      expect(violationsOf(result)).toContain('per-task cap: asked for 50, max is 5');
    });

    it.each([0, -3])('rejects %s', (amount) => {
      const result = evaluatePolicy(propose(amount), context);
      expect(violationsOf(result)).toEqual([
        `amount must be greater than 0: asked for ${amount}`,
      ]);
    });

    it.each([NaN, Infinity, -Infinity])('rejects %s instead of letting comparisons pass', (amount) => {
      const result = evaluatePolicy(propose(amount), context);
      expect(result.ok).toBe(false);
      expect(violationsOf(result)[0]).toContain('not a valid number');
    });
  });

  describe('decimal places', () => {
    it('accepts two decimal places', () => {
      expect(evaluatePolicy(propose(1.25), context).ok).toBe(true);
      expect(evaluatePolicy(propose(1.15), context).ok).toBe(true);
    });

    it('rejects more than two decimal places', () => {
      const result = evaluatePolicy(propose(1.234), context);
      expect(violationsOf(result)).toEqual([
        'amount has more than 2 decimal places: 1.234',
      ]);
    });
  });

  describe('daily cap', () => {
    it('accepts a payout that lands exactly on the daily cap', () => {
      expect(evaluatePolicy(propose(5), { ...context, dailyTotal: 5 }).ok).toBe(true);
    });

    it('rejects a payout that pushes the daily total over the cap', () => {
      const result = evaluatePolicy(propose(3), { ...context, dailyTotal: 8 });
      expect(violationsOf(result)).toEqual([
        'daily cap: already paid 8 today, asked for 3, max is 10 per day',
      ]);
    });

    it('is not fooled by floating point sums', () => {
      expect(evaluatePolicy(propose(0.2), { ...context, dailyTotal: 9.8 }).ok).toBe(true);
      expect(evaluatePolicy(propose(0.3), { ...context, dailyTotal: 9.8 }).ok).toBe(false);
    });
  });

  describe('recipient', () => {
    it('rejects a payout to any wallet other than the submitted one', () => {
      const result = evaluatePolicy(propose(2, 'rAttacker'), context);
      expect(violationsOf(result)).toEqual([
        'recipient mismatch: proposal pays rAttacker, submitted wallet is rUser',
      ]);
    });

    it('is case sensitive, since XRPL addresses are', () => {
      expect(evaluatePolicy(propose(2, 'RUSER'), context).ok).toBe(false);
    });
  });

  describe('place allowlist', () => {
    it('rejects a place that is not on the allowlist', () => {
      const result = evaluatePolicy(propose(2), { ...context, placeId: 'unknown' });
      expect(violationsOf(result)).toEqual([
        'place not allowed: unknown is not on the allowlist',
      ]);
    });
  });

  it('reports every violation together', () => {
    const result = evaluatePolicy(propose(50, 'rAttacker'), { ...context, dailyTotal: 9 });
    expect(violationsOf(result)).toHaveLength(3);
    expect(violationsOf(result)).toEqual(
      expect.arrayContaining([
        'per-task cap: asked for 50, max is 5',
        'recipient mismatch: proposal pays rAttacker, submitted wallet is rUser',
        'daily cap: already paid 9 today, asked for 50, max is 10 per day',
      ])
    );
  });

  it('carries the policy version on failures too', () => {
    expect(evaluatePolicy(propose(50), context).policyVersion).toBe(POLICY_VERSION);
  });
});
