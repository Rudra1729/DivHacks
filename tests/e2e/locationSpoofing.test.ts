/**End-to-end tests for faked locations: each attack goes through POST /submissions
and must be blocked by Sentinel before any money moves or any stamp is minted.*/

import { frozenTrail, offsetMeters, realisticTrail } from '../testHelpers/locationTrail';
import { buildE2eStack, E2eStack, makeUser, place, resetGlobalTestState, submit, TestUser } from './harness';

describe('e2e: location spoofing', () => {
  let stack: E2eStack;

  beforeEach(() => {
    stack = buildE2eStack();
  });
  afterEach(resetGlobalTestState);

  async function expectNothingPaid(user: TestUser): Promise<void> {
    expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(0);
    expect(await stack.solana.getStamps(user.solana)).toEqual([]);
  }

  it('pays an honest phone that sampled GPS while the camera was open', async () => {
    const user = makeUser(1);

    const response = await submit(stack.app, user, place(0));

    expect(response.body.status).toBe('OK');
    expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(place(0).baseRewardRlusd);
  });

  it("blocks a browser's location override: the same reading on the map pin every time", async () => {
    const user = makeUser(2);

    const response = await submit(stack.app, user, place(0), { trail: frozenTrail(place(0)) });

    expect(response.status).toBe(422);
    expect(response.body.status).toBe('BLOCKED_SENTINEL');
    expect(response.body.reasons).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^location trail: GPS did not move/),
        expect.stringMatching(/^coordinates: exactly on Apollo Theater's map pin/),
      ])
    );
    await expectNothingPaid(user);
  });

  it('blocks a script that sends coordinates without a GPS trail', async () => {
    const user = makeUser(3);

    const response = await submit(stack.app, user, place(0), { trail: null, location: offsetMeters(place(0), 21.7, 13.3) });

    expect(response.body.status).toBe('BLOCKED_SENTINEL');
    expect(response.body.reasons).toEqual([expect.stringMatching(/^location trail: missing/)]);
    await expectNothingPaid(user);
  });

  it('blocks a spoofing app that claims 0 m accuracy', async () => {
    const user = makeUser(4);
    const trail = realisticTrail(place(0)).map((sample) => ({ ...sample, accuracy: 0 }));

    const response = await submit(stack.app, user, place(0), { trail });

    expect(response.body.status).toBe('BLOCKED_SENTINEL');
    expect(response.body.reasons).toEqual([expect.stringMatching(/^gps accuracy: a reading claims 0m accuracy/)]);
    await expectNothingPaid(user);
  });

  it('blocks hand-typed coordinates near the place', async () => {
    const user = makeUser(5);
    const trail = realisticTrail(place(0)).map((sample, i) => ({
      ...sample,
      latitude: 40.8104,
      longitude: i % 2 === 0 ? -73.9502 : -73.9503,
    }));

    const response = await submit(stack.app, user, place(0), { trail });

    expect(response.body.status).toBe('BLOCKED_SENTINEL');
    expect(response.body.reasons).toEqual([expect.stringMatching(/^coordinates: .* look typed in/)]);
    await expectNothingPaid(user);
  });

  it('blocks a trail too short to be the camera sampling GPS', async () => {
    const user = makeUser(6);

    const response = await submit(stack.app, user, place(0), { trail: realisticTrail(place(0), { spanMs: 3_000 }) });

    expect(response.body.status).toBe('BLOCKED_SENTINEL');
    expect(response.body.reasons).toEqual([expect.stringMatching(/^location trail: covers 3s/)]);
    await expectNothingPaid(user);
  });

  it('blocks one wallet claiming a place 1.3 km away seconds after its last claim', async () => {
    const user = makeUser(7);
    const apollo = place(0);
    const hamiltonGrange = place(3);
    expect((await submit(stack.app, user, apollo)).body.status).toBe('OK');

    const response = await submit(stack.app, user, hamiltonGrange);

    expect(response.body.status).toBe('BLOCKED_SENTINEL');
    expect(response.body.reasons).toEqual([expect.stringMatching(/^impossible travel: 1\.\d km/)]);
    expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(apollo.baseRewardRlusd);
    expect(await stack.solana.getStamps(user.solana)).toHaveLength(1);
  });

  it('blocks a third wallet sending exactly the same coordinates as two others', async () => {
    const shared = realisticTrail(place(0));
    expect((await submit(stack.app, makeUser(8), place(0), { trail: shared })).body.status).toBe('OK');
    expect((await submit(stack.app, makeUser(9), place(0), { trail: shared })).body.status).toBe('OK');
    const third = makeUser(10);

    const response = await submit(stack.app, third, place(0), { trail: shared });

    expect(response.body.status).toBe('BLOCKED_SENTINEL');
    expect(response.body.reasons).toEqual([expect.stringMatching(/^cluster: 2 other wallets/)]);
    await expectNothingPaid(third);
  });

  it('records every failed check in the decision audit trail', async () => {
    const response = await submit(stack.app, makeUser(11), place(0), { trail: frozenTrail(place(0)) });

    const saved = stack.db
      .prepare("SELECT message FROM audit_events WHERE decision_id = ? AND layer = 'sentinel'")
      .all(response.body.decisionId) as Array<{ message: string }>;
    expect(saved.map((row) => row.message).join(' ')).toContain('GPS did not move');
  });
});
