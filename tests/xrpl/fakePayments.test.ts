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
    const result = await sendPayment({ decisionId: 'd1', userXrplAddress: USER, amount: 2 });

    expect(result.ok).toBe(true);
    expect(await getRlusdBalance(USER)).toBe(2);
    expect(await getRlusdBalance(getAgentAddress())).toBe(8);
    expect(await getPaidToday(USER)).toBe(2);
  });

  it('rejects a payment larger than the agent allowance like the ledger would', async () => {
    const result = await sendPayment({ decisionId: 'd2', userXrplAddress: ATTACKER, amount: 50 });

    expect(result).toMatchObject({ ok: false, reason: 'ledger_rejected', resultCode: 'tecPATH_PARTIAL' });
    expect(await getRlusdBalance(ATTACKER)).toBe(0);
    expect(await getRlusdBalance(getAgentAddress())).toBe(10);
  });

  it('rejects malformed amounts without sending', async () => {
    for (const amount of [0, -1, 1.234, Number.NaN]) {
      const result = await sendPayment({ decisionId: 'd3', userXrplAddress: USER, amount });
      expect(result).toMatchObject({ ok: false, reason: 'invalid_input' });
    }
    expect(await getRlusdBalance(getAgentAddress())).toBe(10);
  });

  it('adds up several payments to the same user', async () => {
    await sendPayment({ decisionId: 'd4', userXrplAddress: USER, amount: 2 });
    await sendPayment({ decisionId: 'd5', userXrplAddress: USER, amount: 2.5 });

    expect(await getPaidToday(USER)).toBe(4.5);
  });
});
