import { AgentBalanceCache, checkSolvency, coversReward } from '../../src/solvency/solvency';
import { XrplService } from '../../src/xrpl/types';

function xrplWithBalance(read: () => Promise<number>): Pick<XrplService, 'getRlusdBalance' | 'getAgentAddress'> {
  return { getRlusdBalance: jest.fn(read), getAgentAddress: () => 'rAgent' };
}

describe('coversReward', () => {
  it('is true when the balance is more than, or exactly, the reward', () => {
    expect(coversReward(5, 1)).toBe(true);
    expect(coversReward(1, 1)).toBe(true);
  });

  it('is false when the balance is even one cent short', () => {
    expect(coversReward(0.99, 1)).toBe(false);
    expect(coversReward(0, 0.01)).toBe(false);
  });

  it('is not fooled by floating point noise', () => {
    // 0.1 + 0.2 is 0.30000000000000004 in floating point, which is 30 cents.
    expect(coversReward(0.1 + 0.2, 0.3)).toBe(true);
    expect(coversReward(0.3, 0.1 + 0.2)).toBe(true);
  });

  it('is false for a balance that is not a usable number', () => {
    expect(coversReward(NaN, 1)).toBe(false);
    expect(coversReward(-1, 0.01)).toBe(false);
  });
});

describe('checkSolvency', () => {
  it('reads the agent wallet balance and passes when it covers the reward', async () => {
    const xrpl = xrplWithBalance(async () => 4);

    const result = await checkSolvency(xrpl, 1);

    expect(result).toEqual({ ok: true, balance: 4 });
    expect(xrpl.getRlusdBalance).toHaveBeenCalledWith('rAgent');
  });

  it('reports the shortfall when the balance cannot cover the reward', async () => {
    const result = await checkSolvency(xrplWithBalance(async () => 0.5), 1);

    expect(result).toEqual({ ok: false, reason: 'insufficient', balance: 0.5, needed: 1 });
  });

  it('fails closed when the balance cannot be read', async () => {
    const result = await checkSolvency(
      xrplWithBalance(async () => {
        throw new Error('websocket closed');
      }),
      1
    );

    expect(result).toEqual({ ok: false, reason: 'unreadable', error: 'websocket closed' });
  });

  it('fails closed when the ledger answers with something that is not a number', async () => {
    const result = await checkSolvency(xrplWithBalance(async () => NaN), 1);

    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ reason: 'unreadable' });
  });
});

describe('AgentBalanceCache', () => {
  it('reads the ledger once and reuses the answer until it expires', async () => {
    let now = 1000;
    const xrpl = xrplWithBalance(async () => 7);
    const cache = new AgentBalanceCache(xrpl, { ttlMs: 10_000, now: () => now });

    expect(await cache.read()).toBe(7);
    now += 9_999;
    expect(await cache.read()).toBe(7);
    expect(xrpl.getRlusdBalance).toHaveBeenCalledTimes(1);

    now += 2;
    await cache.read();
    expect(xrpl.getRlusdBalance).toHaveBeenCalledTimes(2);
  });

  it('shares one read between requests that arrive together', async () => {
    const xrpl = xrplWithBalance(() => new Promise((resolve) => setTimeout(() => resolve(3), 10)));
    const cache = new AgentBalanceCache(xrpl, { ttlMs: 10_000 });

    const answers = await Promise.all([cache.read(), cache.read(), cache.read()]);

    expect(answers).toEqual([3, 3, 3]);
    expect(xrpl.getRlusdBalance).toHaveBeenCalledTimes(1);
  });

  it('answers null when the ledger cannot be read, and does not hammer it while it is down', async () => {
    const now = 0;
    const xrpl = xrplWithBalance(async () => {
      throw new Error('down');
    });
    const cache = new AgentBalanceCache(xrpl, { ttlMs: 10_000, now: () => now });

    expect(await cache.read()).toBeNull();
    expect(await cache.read()).toBeNull();

    expect(xrpl.getRlusdBalance).toHaveBeenCalledTimes(1);
  });

  it('recovers on the next read after the wait is over', async () => {
    let now = 0;
    const reads = jest.fn().mockRejectedValueOnce(new Error('blip')).mockResolvedValue(6);
    const cache = new AgentBalanceCache(xrplWithBalance(reads), { ttlMs: 10_000, now: () => now });

    expect(await cache.read()).toBeNull();
    now += 10_001;
    expect(await cache.read()).toBe(6);
  });
});
