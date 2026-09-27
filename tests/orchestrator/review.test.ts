import { resolveReview } from '../../src/orchestrator/review';

const verdict = (v: Record<string, unknown>) => ({ kind: 'verdict' as const, verdict: v as never });

describe('resolveReview', () => {
  describe('approve', () => {
    it('pays the proposal unchanged', () => {
      const result = resolveReview(2, 1, verdict({ decision: 'approve', reason: 'fine' }));

      expect(result).toMatchObject({ action: 'pay', amount: 2 });
      expect(result.action === 'pay' && result.note).toBeUndefined();
    });

    it('ignores an amount sent with approve', () => {
      const result = resolveReview(2, 1, verdict({ decision: 'approve', amount: 500, reason: 'fine' }));

      expect(result).toMatchObject({ action: 'pay', amount: 2 });
    });
  });

  describe('reduce', () => {
    it('pays the lower amount', () => {
      const result = resolveReview(4, 1, verdict({ decision: 'reduce', amount: 1.5, reason: 'high' }));

      expect(result).toMatchObject({ action: 'pay', amount: 1.5, note: expect.stringContaining('from 4 to 1.5') });
    });

    it('never pays more than the proposal, even if the reviewer names a larger amount', () => {
      const result = resolveReview(2, 1, verdict({ decision: 'reduce', amount: 50, reason: 'fooled' }));

      // A larger amount is unusable, so the safe fallback applies: at most the base reward.
      expect(result).toMatchObject({ action: 'pay', amount: 1 });
    });

    it.each([
      ['NaN', NaN],
      ['Infinity', Infinity],
      ['-Infinity', -Infinity],
      ['zero', 0],
      ['a negative amount', -3],
      ['less than one cent', 0.004],
    ])('ignores %s and falls back to at most the base reward', (_name, amount) => {
      const result = resolveReview(4, 1, verdict({ decision: 'reduce', amount, reason: 'x' }));

      expect(result).toMatchObject({ action: 'pay', amount: 1 });
    });

    it('falls back to the proposal, not the base reward, when the proposal is already lower', () => {
      const result = resolveReview(0.5, 1, verdict({ decision: 'reduce', amount: 999, reason: 'x' }));

      expect(result).toMatchObject({ action: 'pay', amount: 0.5 });
    });

    it('rounds an amount with too many decimals down to cents', () => {
      const result = resolveReview(4, 1, verdict({ decision: 'reduce', amount: 1.999, reason: 'x' }));

      expect(result).toMatchObject({ action: 'pay', amount: 1.99 });
    });

    it('treats a reduce to exactly the proposal as no change', () => {
      const result = resolveReview(2, 1, verdict({ decision: 'reduce', amount: 2, reason: 'same' }));

      expect(result).toMatchObject({ action: 'pay', amount: 2 });
      expect(result.action === 'pay' && result.note).toBeUndefined();
    });
  });

  describe('reject', () => {
    it('stops the payout and keeps the reviewer reason', () => {
      const result = resolveReview(2, 1, verdict({ decision: 'reject', reason: 'wrong wallet' }));

      expect(result).toEqual({ action: 'reject', reason: 'wrong wallet' });
    });
  });

  describe('when the reviewer failed', () => {
    it('caps the payout at the base reward', () => {
      const result = resolveReview(5, 1, { kind: 'failed', error: 'timed out' });

      expect(result).toMatchObject({
        action: 'pay',
        amount: 1,
        message: expect.stringContaining('timed out'),
        note: expect.stringContaining('from 5 to 1'),
      });
    });

    it('pays the proposal when it is below the base reward, never raising it', () => {
      const result = resolveReview(0.25, 1, { kind: 'failed', error: 'bad JSON' });

      expect(result).toMatchObject({ action: 'pay', amount: 0.25 });
    });

    it('pays the proposal when it equals the base reward', () => {
      const result = resolveReview(1, 1, { kind: 'failed', error: 'down' });

      expect(result).toMatchObject({ action: 'pay', amount: 1 });
      expect(result.action === 'pay' && result.note).toBeUndefined();
    });
  });

  it('never returns an amount above the proposal, for any reviewer answer', () => {
    const proposals = [0.01, 0.5, 1, 1.5, 2, 5];
    const answers = [
      verdict({ decision: 'approve', reason: '' }),
      verdict({ decision: 'reduce', amount: 1e9, reason: '' }),
      verdict({ decision: 'reduce', amount: 0.01, reason: '' }),
      verdict({ decision: 'reduce', amount: NaN, reason: '' }),
      { kind: 'failed' as const, error: 'x' },
    ];
    for (const proposed of proposals) {
      for (const answer of answers) {
        const result = resolveReview(proposed, 1, answer);
        if (result.action === 'pay') {
          expect(result.amount).toBeLessThanOrEqual(proposed);
          expect(result.amount).toBeGreaterThan(0);
        }
      }
    }
  });
});
