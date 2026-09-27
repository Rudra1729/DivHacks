import Database from 'better-sqlite3';
import { Client, Wallet } from 'xrpl';
import { provisionWallets } from '../../src/auth/provisionWallet';
import { openDatabase } from '../../src/db';
import { createUser } from '../../src/db/users';
import { USER_TRUST_LIMIT, WalletActivator, withWalletActivation } from '../../src/xrpl/activation';
import { loadXrplConfig, XrplConfig } from '../../src/xrpl/config';
import { XrplService } from '../../src/xrpl/types';

const env = { WALLET_ENCRYPTION_KEY: 'test-passphrase-do-not-use-in-prod' };
const REAL = loadXrplConfig({ XRPL_MODE: 'real', AGENT_SEED: Wallet.generate().seed });
const FAKE = loadXrplConfig({ XRPL_MODE: 'fake' });

/** A tiny stand-in for the XRPL ledger: which accounts exist and which trust RLUSD. */
function fakeLedger(opts: { exists?: boolean; trusts?: boolean; trustResult?: string } = {}) {
  const state = { exists: opts.exists ?? false, trusts: opts.trusts ?? false };
  const calls = { fund: 0, trustSet: [] as unknown[] };
  const client = {
    request: jest.fn(async (req: { command: string }) => {
      if (!state.exists) {
        throw Object.assign(new Error('Account not found.'), { data: { error: 'actNotFound' } });
      }
      if (req.command === 'account_info') return { result: {} };
      return {
        result: {
          lines: state.trusts
            ? [{ currency: REAL.rlusdCurrency, account: REAL.rlusdIssuer, limit: USER_TRUST_LIMIT, balance: '0' }]
            : [],
        },
      };
    }),
    fundWallet: jest.fn(async () => {
      calls.fund += 1;
      state.exists = true;
    }),
    submitAndWait: jest.fn(async (tx: unknown) => {
      calls.trustSet.push(tx);
      const code = opts.trustResult ?? 'tesSUCCESS';
      if (code === 'tesSUCCESS') state.trusts = true;
      return { result: { meta: { TransactionResult: code } } };
    }),
  };
  return { client: client as unknown as Client, calls };
}

function setup(config: XrplConfig, ledger = fakeLedger()) {
  const db: Database.Database = openDatabase(':memory:');
  const user = createUser(db, 'hero@example.com', provisionWallets(env));
  const activator = new WalletActivator(db, { loadConfig: () => config, connect: async () => ledger.client, env });
  return { db, user, activator, ledger };
}

describe('WalletActivator', () => {
  it('does nothing in fake mode', async () => {
    const { user, activator, ledger } = setup(FAKE);
    expect(await activator.ensureReady(user.xrplAddress)).toEqual({ ok: true });
    expect(ledger.calls.fund).toBe(0);
  });

  it('leaves addresses that are not custodial users alone', async () => {
    const { activator, ledger } = setup(REAL);
    expect(await activator.ensureReady('rGcs4fH41trNy8HahNy3zCQVDFSrAQYqnN')).toEqual({ ok: true });
    expect(ledger.calls.fund).toBe(0);
    expect(ledger.calls.trustSet).toHaveLength(0);
  });

  it('funds a brand-new wallet and opens its RLUSD trust line', async () => {
    const { user, activator, ledger } = setup(REAL);
    expect(await activator.ensureReady(user.xrplAddress)).toEqual({ ok: true });
    expect(ledger.calls.fund).toBe(1);
    expect(ledger.calls.trustSet).toEqual([
      {
        TransactionType: 'TrustSet',
        Account: user.xrplAddress,
        LimitAmount: { currency: REAL.rlusdCurrency, issuer: REAL.rlusdIssuer, value: USER_TRUST_LIMIT },
      },
    ]);
  });

  it('only opens the trust line when the wallet already exists', async () => {
    const { user, activator, ledger } = setup(REAL, fakeLedger({ exists: true }));
    expect(await activator.ensureReady(user.xrplAddress)).toEqual({ ok: true });
    expect(ledger.calls.fund).toBe(0);
    expect(ledger.calls.trustSet).toHaveLength(1);
  });

  it('sends nothing for a wallet that is already ready, and remembers it', async () => {
    const { user, activator, ledger } = setup(REAL, fakeLedger({ exists: true, trusts: true }));
    await activator.ensureReady(user.xrplAddress);
    await activator.ensureReady(user.xrplAddress);
    expect(ledger.calls.fund).toBe(0);
    expect(ledger.calls.trustSet).toHaveLength(0);
    expect(ledger.client.request).toHaveBeenCalledTimes(2);
  });

  it('activates a wallet once when two payments race', async () => {
    const { user, activator, ledger } = setup(REAL);
    await Promise.all([activator.ensureReady(user.xrplAddress), activator.ensureReady(user.xrplAddress)]);
    expect(ledger.calls.fund).toBe(1);
    expect(ledger.calls.trustSet).toHaveLength(1);
  });

  it('reports a failed trust line instead of throwing', async () => {
    const { user, activator } = setup(REAL, fakeLedger({ exists: true, trustResult: 'tecNO_LINE_INSUF_RESERVE' }));
    expect(await activator.ensureReady(user.xrplAddress)).toEqual({
      ok: false,
      error: 'opening the RLUSD trust line failed with tecNO_LINE_INSUF_RESERVE',
    });
  });

  it('reports a faucet failure instead of throwing', async () => {
    const ledger = fakeLedger();
    (ledger.client.fundWallet as jest.Mock).mockRejectedValue(new Error('faucet is down'));
    const { user, activator } = setup(REAL, ledger);
    expect(await activator.ensureReady(user.xrplAddress)).toEqual({ ok: false, error: 'faucet is down' });
  });
});

describe('withWalletActivation', () => {
  const input = { decisionId: 'd-1', recipient: 'rRecipient', amount: 0.01 };

  function inner(): XrplService {
    return {
      sendPayment: jest.fn(async () => ({ ok: true as const, txHash: 'HASH', resultCode: 'tesSUCCESS' as const })),
      getRlusdBalance: jest.fn(async () => 1),
      getPaidToday: jest.fn(async () => 0),
      getAgentAddress: () => 'rAgent',
    };
  }

  it('activates the recipient, then pays', async () => {
    const service = inner();
    const activator = { ensureReady: jest.fn(async () => ({ ok: true as const })) };
    const result = await withWalletActivation(service, activator).sendPayment(input);
    expect(activator.ensureReady).toHaveBeenCalledWith('rRecipient');
    expect(result).toEqual({ ok: true, txHash: 'HASH', resultCode: 'tesSUCCESS' });
  });

  it('sends nothing and reports network_error when activation fails', async () => {
    const service = inner();
    const activator = { ensureReady: async () => ({ ok: false as const, error: 'faucet is down' }) };
    const result = await withWalletActivation(service, activator).sendPayment(input);
    expect(service.sendPayment).not.toHaveBeenCalled();
    expect(result).toEqual({
      ok: false,
      reason: 'network_error',
      error: 'could not activate the recipient wallet, nothing sent: faucet is down',
    });
  });

  it('passes the read calls straight through', async () => {
    const wrapped = withWalletActivation(inner(), { ensureReady: async () => ({ ok: true as const }) });
    expect(await wrapped.getRlusdBalance('rX')).toBe(1);
    expect(await wrapped.getPaidToday('rX')).toBe(0);
    expect(wrapped.getAgentAddress()).toBe('rAgent');
  });
});
