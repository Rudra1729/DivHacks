import { FakeXrpl, FAKE_AGENT_ADDRESS } from '../../src/xrpl/fakeXrpl';

describe('FakeXrpl', () => {
  it('pays from the agent wallet and tracks the recipient', async () => {
    const xrpl = new FakeXrpl(10);
    const result = await xrpl.sendPayment({ decisionId: 'd1', recipient: 'rUser', amount: 2 });

    expect(result).toMatchObject({ ok: true, resultCode: 'tesSUCCESS' });
    expect(await xrpl.getRlusdBalance('rUser')).toBe(2);
    expect(await xrpl.getRlusdBalance(FAKE_AGENT_ADDRESS)).toBe(8);
    expect(await xrpl.getPaidToday('rUser')).toBe(2);
  });

  it('exposes the agent address for the bypass test', () => {
    expect(new FakeXrpl().getAgentAddress()).toBe(FAKE_AGENT_ADDRESS);
  });

  it('rejects a payment larger than the agent wallet holds, sending to the address as given', async () => {
    const xrpl = new FakeXrpl(10);
    const result = await xrpl.sendPayment({ decisionId: 'd2', recipient: 'rAttacker', amount: 50 });

    expect(result).toMatchObject({ ok: false, reason: 'ledger_rejected', resultCode: 'tecPATH_PARTIAL' });
    expect(await xrpl.getRlusdBalance('rAttacker')).toBe(0);
    expect(await xrpl.getRlusdBalance(FAKE_AGENT_ADDRESS)).toBe(10);
  });

  it('reports invalid input for zero, negative, non-finite, and over-precise amounts', async () => {
    const xrpl = new FakeXrpl(10);
    let n = 0;
    for (const amount of [0, -1, NaN, Infinity, 1.234]) {
      const result = await xrpl.sendPayment({ decisionId: `bad-${n++}`, recipient: 'rUser', amount });
      expect(result).toMatchObject({ ok: false, reason: 'invalid_input' });
    }
    expect(await xrpl.getRlusdBalance(FAKE_AGENT_ADDRESS)).toBe(10);
  });

  it('gives each payment a distinct tx hash', async () => {
    const xrpl = new FakeXrpl(10);
    const a = await xrpl.sendPayment({ decisionId: 'd4', recipient: 'rUser', amount: 1 });
    const b = await xrpl.sendPayment({ decisionId: 'd5', recipient: 'rUser', amount: 1 });

    expect(a.ok && b.ok && a.txHash !== b.txHash).toBe(true);
  });

  it('never pays twice for the same decision ID', async () => {
    const xrpl = new FakeXrpl(10);
    const first = await xrpl.sendPayment({ decisionId: 'same', recipient: 'rUser', amount: 2 });
    const second = await xrpl.sendPayment({ decisionId: 'same', recipient: 'rUser', amount: 2 });

    expect(second).toEqual(first);
    expect(await xrpl.getRlusdBalance('rUser')).toBe(2);
    expect(await xrpl.getRlusdBalance(FAKE_AGENT_ADDRESS)).toBe(8);
  });
});
