import { buildE2eStack, E2eStack, makeUser, place, resetGlobalTestState, submit } from './harness';

describe('e2e: spending limits', () => {
  let stack: E2eStack;

  beforeEach(() => {
    // One user visits several places a kilometer apart within milliseconds here,
    // which the impossible-travel check would block. Location checks have their own suite.
    stack = buildE2eStack({ locationChecks: false });
  });
  afterEach(resetGlobalTestState);

  describe('daily cap of 10 RLUSD per user', () => {
    it('blocks a payout that would go over the cap and allows one that lands exactly on it', async () => {
      const user = makeUser(1);
      // Topped up, so this test is about the daily cap and not the agent wallet running out.
      stack.xrpl.fundAgent(10);

      const first = await submit(stack.app, user, place(0), { caption: 'AMOUNT:4' });
      const second = await submit(stack.app, user, place(1), { caption: 'AMOUNT:4' });
      expect([first.body.status, second.body.status]).toEqual(['OK', 'OK']);

      const overCap = await submit(stack.app, user, place(2), { caption: 'AMOUNT:4' });
      expect(overCap.status).toBe(422);
      expect(overCap.body.status).toBe('BLOCKED_POLICY');
      expect(overCap.body.reasons).toEqual([
        'daily cap: already paid 8 today, asked for 4, max is 10 per day',
      ]);
      expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(8);

      // Exactly 10 in total is allowed.
      const exact = await submit(stack.app, user, place(2), { caption: 'AMOUNT:2' });
      expect(exact.body.status).toBe('OK');
      expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(10);

      // Anything more is blocked.
      const beyond = await submit(stack.app, user, place(3), { caption: 'AMOUNT:1' });
      expect(beyond.body.status).toBe('BLOCKED_POLICY');
      expect(beyond.body.reasons[0]).toContain('daily cap: already paid 10 today');
      expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(10);
    });

    it('applies per user, so another user is not affected by the first user reaching the cap', async () => {
      const first = makeUser(2);
      // 5 + 4 = 9, so the agent wallet still has 1 RLUSD left for someone else.
      await submit(stack.app, first, place(0), { caption: 'AMOUNT:5' });
      await submit(stack.app, first, place(1), { caption: 'AMOUNT:4' });

      const other = await submit(stack.app, makeUser(3), place(2), { caption: 'AMOUNT:1' });

      expect(other.body.status).toBe('OK');
    });
  });

  describe('agent wallet allowance', () => {
    it('is a second cap: a payout the policy allows is rejected by the ledger when the wallet holds less than it', async () => {
      // Two users take 8.5 of the 10 RLUSD allowance, leaving 1.5: enough for the
      // 1 RLUSD reward the solvency gate looks for, but not for the 2 RLUSD below.
      await submit(stack.app, makeUser(4), place(0), { caption: 'AMOUNT:5' });
      await submit(stack.app, makeUser(5), place(1), { caption: 'AMOUNT:3.5' });
      expect(await stack.xrpl.getRlusdBalance(stack.xrpl.getAgentAddress())).toBe(1.5);

      const third = makeUser(6);
      const response = await submit(stack.app, third, place(2), { caption: 'AMOUNT:2' });

      expect(response.status).toBe(402);
      expect(response.body.status).toBe('REJECTED_BY_LEDGER');
      expect(response.body.xrplResultCode).toBe('tecPATH_PARTIAL');
      expect(await stack.xrpl.getRlusdBalance(third.xrpl)).toBe(0);
      expect(await stack.solana.getStamps(third.solana)).toEqual([]);
    });
  });

  describe('race: submissions at the same instant', () => {
    it('pays only the allowed amount when two payouts arrive at the same instant', async () => {
      const user = makeUser(7);
      await submit(stack.app, user, place(0), { caption: 'AMOUNT:4' });

      // Each 4 fits on its own (4 + 4 = 8), but both together (12) break the cap of 10.
      const [a, b] = await Promise.all([
        submit(stack.app, user, place(1), { caption: 'AMOUNT:4' }),
        submit(stack.app, user, place(2), { caption: 'AMOUNT:4' }),
      ]);

      expect([a.body.status, b.body.status].sort()).toEqual(['BLOCKED_POLICY', 'OK']);
      expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(8);
    });

    it('lets only the allowed payouts through when three racing payouts would go over the cap', async () => {
      const user = makeUser(8);
      stack.xrpl.fundAgent(5);

      const responses = await Promise.all([
        submit(stack.app, user, place(0), { caption: 'AMOUNT:5' }),
        submit(stack.app, user, place(1), { caption: 'AMOUNT:5' }),
        submit(stack.app, user, place(2), { caption: 'AMOUNT:5' }),
      ]);

      const statuses = responses.map((r) => r.body.status).sort();
      expect(statuses).toEqual(['BLOCKED_POLICY', 'OK', 'OK']);
      expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(10);
      expect(await stack.solana.getStamps(user.solana)).toHaveLength(2);
    });

    it('pays once when the same user claims the same place twice at the same instant', async () => {
      const user = makeUser(9);

      const [a, b] = await Promise.all([
        submit(stack.app, user, place(0)),
        submit(stack.app, user, place(0)),
      ]);

      expect([a.body.status, b.body.status].sort()).toEqual(['BLOCKED_SENTINEL', 'OK']);
      expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(place(0).baseRewardRlusd);
      expect(await stack.solana.getStamps(user.solana)).toHaveLength(1);
    });

    it('does not make different users wait on each other', async () => {
      const [a, b] = await Promise.all([
        submit(stack.app, makeUser(10), place(0)),
        submit(stack.app, makeUser(11), place(0)),
      ]);

      expect([a.body.status, b.body.status]).toEqual(['OK', 'OK']);
    });
  });
});
