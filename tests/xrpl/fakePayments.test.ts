import { fakePaymentService } from '../../src/xrpl/fakePayments';
import { getAgentAddress, getPaidToday, getRlusdBalance, sendPayment } from '../../src/xrpl';

const USER = 'rUserOne000000000000000000000000';
const ATTACKER = 'rAttacker0000000000000000000000';

describe('fake XRPL payments', () => {
  beforeEach(() => {
    delete process.env.XRPL_MODE;
    fakePaymentService.reset();
  });

  it('pays a reward and updates balances', async () => {
    const result = await sendPayment({ decisionId: 'd1', recipient: USER, amount: 2 });

    expect(result.ok).toBe(true);
    expect(await getRlusdBalance(USER)).toBe(2);
    expect(await getRlusdBalance(getAgentAddress())).toBe(8);
    expect(await getPaidToday(USER)).toBe(2);
  });

  it('rejects a payment larger than the agent allowance like the ledger would', async () => {
    const result = await sendPayment({ decisionId: 'd2', recipient: ATTACKER, amount: 50 });

    expect(result).toMatchObject({ ok: false, reason: 'ledger_rejected', resultCode: 'tecPATH_PARTIAL' });
    expect(await getRlusdBalance(ATTACKER)).toBe(0);
    expect(await getRlusdBalance(getAgentAddress())).toBe(10);
  });

  it('rejects malformed amounts without sending', async () => {
    for (const amount of [0, -1, 1.234, Number.NaN]) {
      const result = await sendPayment({ decisionId: 'd3', recipient: USER, amount });
      expect(result).toMatchObject({ ok: false, reason: 'invalid_input' });
    }
    expect(await getRlusdBalance(getAgentAddress())).toBe(10);
  });

  it('never pays the same decision twice', async () => {
    const first = await sendPayment({ decisionId: 'dup', recipient: USER, amount: 2 });
    const second = await sendPayment({ decisionId: 'dup', recipient: USER, amount: 2 });

    expect(second).toEqual(first);
    expect(await getRlusdBalance(USER)).toBe(2);
    expect(await getRlusdBalance(getAgentAddress())).toBe(8);
  });

  it('never pays twice when the same decision is sent concurrently', async () => {
    await Promise.all([
      sendPayment({ decisionId: 'race', recipient: USER, amount: 2 }),
      sendPayment({ decisionId: 'race', recipient: USER, amount: 2 }),
    ]);

    expect(await getRlusdBalance(USER)).toBe(2);
  });

  it('sends to the attacker address as given so the ledger decides', async () => {
    const result = await sendPayment({ decisionId: 'small', recipient: ATTACKER, amount: 1 });

    expect(result.ok).toBe(true);
    expect(await getRlusdBalance(ATTACKER)).toBe(1);
  });

  it('returns a result instead of throwing on a bad config', async () => {
    process.env.XRPL_MODE = 'nonsense';

    const result = await sendPayment({ decisionId: 'cfg', recipient: USER, amount: 2 });

    expect(result).toMatchObject({ ok: false, reason: 'network_error' });
  });

  it('adds up several payments to the same user', async () => {
    await sendPayment({ decisionId: 'd4', recipient: USER, amount: 2 });
    await sendPayment({ decisionId: 'd5', recipient: USER, amount: 2.5 });

    expect(await getPaidToday(USER)).toBe(4.5);
  });
});
