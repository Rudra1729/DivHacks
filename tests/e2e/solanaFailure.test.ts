import { buildE2eStack, E2eStack, makeUser, place, resetGlobalTestState, submit } from './harness';

interface RetryRow {
  decision_id: string;
  place_id: string;
  solana_address: string;
  xrpl_tx_hash: string;
}

describe('e2e: Solana failure', () => {
  let stack: E2eStack;

  beforeEach(() => {
    stack = buildE2eStack();
  });
  afterEach(resetGlobalTestState);

  it('keeps the payment, queues the mint for retry, and never pays again', async () => {
    const user = makeUser(1);
    stack.solana.setFailMints(true);

    const response = await submit(stack.app, user, place(0), { requestId: 'req-solana-failure' });

    expect(response.status).toBe(202);
    expect(response.body.status).toBe('STAMP_FAILED');
    expect(response.body.stampFailed).toBe(true);
    expect(response.body.xrplTxHash).toBeTruthy();
    expect(response.body.solanaAssetAddress).toBeUndefined();
    expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(place(0).baseRewardRlusd);
    expect(await stack.solana.getStamps(user.solana)).toEqual([]);

    // The failed mint is recorded with everything needed to retry it.
    const retries = stack.db.prepare('SELECT * FROM stamp_retries').all() as RetryRow[];
    expect(retries).toHaveLength(1);
    expect(retries[0]).toMatchObject({
      decision_id: response.body.decisionId,
      place_id: place(0).id,
      solana_address: user.solana,
      xrpl_tx_hash: response.body.xrplTxHash,
    });

    // Sending the same request again, even after Solana recovers, does not pay a second time.
    stack.solana.setFailMints(false);
    const again = await submit(stack.app, user, place(0), { requestId: 'req-solana-failure' });
    expect(again.body.decisionId).toBe(response.body.decisionId);
    expect(again.body.status).toBe('STAMP_FAILED');
    expect(await stack.xrpl.getRlusdBalance(user.xrpl)).toBe(place(0).baseRewardRlusd);
  });

  it('still counts the paid amount toward the daily cap', async () => {
    const user = makeUser(2);
    stack.solana.setFailMints(true);
    await submit(stack.app, user, place(0), { caption: 'AMOUNT:5' });
    await submit(stack.app, user, place(1), { caption: 'AMOUNT:5' });

    const third = await submit(stack.app, user, place(2), { caption: 'AMOUNT:1' });

    expect(third.body.status).toBe('BLOCKED_POLICY');
    expect(third.body.reasons[0]).toContain('daily cap: already paid 10 today');
  });

  it('does not let the user claim the same place again, since the payment already happened', async () => {
    const user = makeUser(3);
    stack.solana.setFailMints(true);
    await submit(stack.app, user, place(0));
    stack.solana.setFailMints(false);

    const second = await submit(stack.app, user, place(0));

    expect(second.body.status).toBe('BLOCKED_SENTINEL');
    expect(second.body.reasons[0]).toMatch(/^once per place:/);
  });
});
