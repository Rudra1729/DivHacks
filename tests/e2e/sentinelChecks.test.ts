import { buildE2eStack, E2eStack, makeUser, place, resetGlobalTestState, submit } from './harness';

describe('e2e: Sentinel checks', () => {
  let stack: E2eStack;

  beforeEach(() => {
    stack = buildE2eStack();
  });
  afterEach(resetGlobalTestState);

  describe('replay', () => {
    it('blocks the same photo sent a second time', async () => {
      const user = makeUser(1);
      const first = await submit(stack.app, user, place(0), { photo: 'the-same-photo' });
      expect(first.body.status).toBe('OK');

      // A different place, so replay is the only thing that can block it.
      const second = await submit(stack.app, user, place(1), { photo: 'the-same-photo' });

      expect(second.status).toBe(422);
      expect(second.body.status).toBe('BLOCKED_SENTINEL');
      expect(second.body.reasons).toHaveLength(1);
      expect(second.body.reasons[0]).toMatch(/^replay:/);
      expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(place(0).baseRewardRlusd);
    });

    it('blocks a photo another user already used', async () => {
      await submit(stack.app, makeUser(1), place(0), { photo: 'shared-photo' });

      const second = await submit(stack.app, makeUser(2), place(0), { photo: 'shared-photo' });

      expect(second.body.status).toBe('BLOCKED_SENTINEL');
      expect(second.body.reasons[0]).toMatch(/^replay:/);
    });
  });

  describe('once per place', () => {
    it('blocks the same user at the same place with a new photo', async () => {
      const user = makeUser(3);
      const first = await submit(stack.app, user, place(0));
      expect(first.body.status).toBe('OK');

      const second = await submit(stack.app, user, place(0));

      expect(second.status).toBe(422);
      expect(second.body.status).toBe('BLOCKED_SENTINEL');
      expect(second.body.reasons).toEqual([expect.stringMatching(/^once per place:/)]);
      expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(place(0).baseRewardRlusd);
      expect(await stack.solana.getStamps(user.solana)).toHaveLength(1);
    });

    it('blocks the same person using a different XRPL address, matched on their Solana wallet', async () => {
      const user = makeUser(4);
      await submit(stack.app, user, place(0));

      const second = await submit(stack.app, user, place(0), { xrplAddress: makeUser(40).xrpl });

      expect(second.body.status).toBe('BLOCKED_SENTINEL');
      expect(second.body.reasons[0]).toMatch(/^once per place:/);
    });

    it('blocks the same person using a different Solana address, matched on their XRPL wallet', async () => {
      const user = makeUser(5);
      await submit(stack.app, user, place(0));

      const second = await submit(stack.app, user, place(0), { solanaAddress: makeUser(50).solana });

      expect(second.body.status).toBe('BLOCKED_SENTINEL');
      expect(second.body.reasons[0]).toMatch(/^once per place:/);
    });

    it('lets the same user claim a different place', async () => {
      const user = makeUser(6);
      await submit(stack.app, user, place(0));

      const second = await submit(stack.app, user, place(1));

      expect(second.body.status).toBe('OK');
      expect(await stack.solana.getStamps(user.solana)).toHaveLength(2);
    });

    it('lets a different user claim the same place', async () => {
      await submit(stack.app, makeUser(7), place(0));

      const second = await submit(stack.app, makeUser(8), place(0));

      expect(second.body.status).toBe('OK');
    });
  });

  describe('stamp already on Solana', () => {
    it('blocks a wallet that already holds a stamp even when the server has a brand new database', async () => {
      const user = makeUser(20);
      const first = await submit(stack.app, user, place(0));
      expect(first.body.status).toBe('OK');

      // Same stamps on Solana, but a server that has lost its database.
      const restarted = buildE2eStack({ solana: stack.solana });
      const second = await submit(restarted.app, user, place(0));

      expect(second.status).toBe(422);
      expect(second.body.status).toBe('BLOCKED_SENTINEL');
      expect(second.body.reasons).toEqual(['once per place: this Solana wallet already holds a stamp for this place']);
      expect(await restarted.xrpl.getRlusdBalance(user.xrpl)).toBe(0);
      expect(await stack.solana.getStamps(user.solana)).toHaveLength(1);
    });

    it('still lets the same wallet claim a different place on a brand new database', async () => {
      const user = makeUser(21);
      await submit(stack.app, user, place(0));

      const restarted = buildE2eStack({ solana: stack.solana });
      const second = await submit(restarted.app, user, place(1));

      expect(second.body.status).toBe('OK');
    });
  });

  describe('location and freshness', () => {
    it('blocks a submission far from the place', async () => {
      const response = await submit(stack.app, makeUser(9), { ...place(0), latitude: 40.7, longitude: -74.0 });

      expect(response.body.status).toBe('BLOCKED_SENTINEL');
      expect(response.body.reasons[0]).toMatch(/^location:/);
    });
  });
});
