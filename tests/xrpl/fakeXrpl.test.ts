import { FakeXrpl, FAKE_AGENT_ADDRESS } from '../../src/xrpl/fakeXrpl';

describe('FakeXrpl', () => {
  it('pays from the agent wallet and tracks the recipient', async () => {
    const xrpl = new FakeXrpl(10);
    const result = await xrpl.pay({ decisionId: 'd1', recipient: 'rUser', amount: 2 });

    expect(result.ok).toBe(true);
    expect(await xrpl.getBalance('rUser')).toBe(2);
    expect(await xrpl.getBalance(FAKE_AGENT_ADDRESS)).toBe(8);
    expect(await xrpl.getPaidToday('rUser')).toBe(2);
  });

  it('rejects a payment larger than the agent wallet holds', async () => {
    const xrpl = new FakeXrpl(10);
    const result = await xrpl.pay({ decisionId: 'd2', recipient: 'rAttacker', amount: 50 });

    expect(result).toEqual({ ok: false, resultCode: 'tecUNFUNDED_PAYMENT' });
    expect(await xrpl.getBalance('rAttacker')).toBe(0);
    expect(await xrpl.getBalance(FAKE_AGENT_ADDRESS)).toBe(10);
  });

  it('rejects zero, negative, and non-finite amounts', async () => {
    const xrpl = new FakeXrpl(10);
    for (const amount of [0, -1, NaN, Infinity]) {
      const result = await xrpl.pay({ decisionId: 'd3', recipient: 'rUser', amount });
      expect(result).toEqual({ ok: false, resultCode: 'temBAD_AMOUNT' });
    }
  });

  it('gives each payment a distinct tx hash', async () => {
    const xrpl = new FakeXrpl(10);
    const a = await xrpl.pay({ decisionId: 'd4', recipient: 'rUser', amount: 1 });
    const b = await xrpl.pay({ decisionId: 'd5', recipient: 'rUser', amount: 1 });

    expect(a.ok && b.ok && a.txHash !== b.txHash).toBe(true);
  });
});
