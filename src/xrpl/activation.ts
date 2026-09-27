/**Activates custodial user wallets on XRPL so they can receive RLUSD.

Every user's XRPL wallet is generated offline at signup, so the ledger has
never heard of it, and a wallet with no RLUSD trust line cannot hold RLUSD.
Before the agent pays a custodial wallet in real mode, this funds it from
the testnet faucet if it does not exist yet and opens its RLUSD trust line,
signed with the user's own seed. Addresses that do not belong to a user are
left alone: whoever owns them sets them up.
*/

import Database from 'better-sqlite3';
import { Client, TrustSet, Wallet } from 'xrpl';
import { decryptSecret } from '../auth/crypto';
import { getUserByXrplAddress, User } from '../db/users';
import { getClient, isAccountNotFound } from './client';
import { loadXrplConfig, XrplConfig } from './config';
import { XrplService } from './types';

/** RLUSD trust line limit for user wallets. High, since users only receive. */
export const USER_TRUST_LIMIT = '1000000';

/** Outcome of making sure a wallet can receive rewards. Never thrown. */
export type ActivationResult = { ok: true } | { ok: false; error: string };

export interface WalletActivatorOptions {
  /** Defaults to reading XRPL settings from the environment on every call. */
  loadConfig?: () => XrplConfig;
  /** Defaults to the shared XRPL connection. */
  connect?: (config: XrplConfig) => Promise<Client>;
  /** Environment WALLET_ENCRYPTION_KEY is read from. Defaults to process.env. */
  env?: NodeJS.ProcessEnv;
}

/** Makes custodial user wallets ready to receive RLUSD on the ledger.

Attributes:
    ready (Set<string>): Addresses already confirmed ready, so later payments skip the checks.
    inFlight (Map<string, Promise<ActivationResult>>): Running activations, so two
        payments to one new wallet do not fund it twice.
*/
export class WalletActivator {
  private ready = new Set<string>();
  private inFlight = new Map<string, Promise<ActivationResult>>();

  /** Create an activator.

  Args:
      db (Database.Database): Database holding the users and their encrypted seeds.
      options (WalletActivatorOptions): Injectable config, connection, and environment.
  */
  constructor(private db: Database.Database, private options: WalletActivatorOptions = {}) {}

  /** Make sure a wallet exists on the ledger and can hold RLUSD.

  Does nothing in fake mode, or for addresses that are not custodial user
  wallets.

  Args:
      xrplAddress (string): The wallet about to be paid.

  Returns:
      Promise<ActivationResult>: ok once the wallet is ready, or why it is not.
  */
  async ensureReady(xrplAddress: string): Promise<ActivationResult> {
    const config = (this.options.loadConfig ?? loadXrplConfig)();
    if (config.mode !== 'real' || this.ready.has(xrplAddress)) {
      return { ok: true };
    }
    const user = getUserByXrplAddress(this.db, xrplAddress);
    if (!user) {
      return { ok: true };
    }

    const running = this.inFlight.get(xrplAddress);
    if (running) {
      return running;
    }
    const attempt = this.activate(config, user).finally(() => this.inFlight.delete(xrplAddress));
    this.inFlight.set(xrplAddress, attempt);
    return attempt;
  }

  /** Fund the wallet if missing, then open its RLUSD trust line if missing. Never throws. */
  private async activate(config: XrplConfig, user: User): Promise<ActivationResult> {
    try {
      const wallet = Wallet.fromSeed(decryptSecret(user.xrplSecretEncrypted, this.options.env));
      if (wallet.classicAddress !== user.xrplAddress) {
        return { ok: false, error: 'the stored XRPL secret does not match the wallet address' };
      }

      const client = await (this.options.connect ?? getClient)(config);
      if (!(await accountExists(client, wallet.classicAddress))) {
        await client.fundWallet(wallet);
      }
      if (config.asset === 'RLUSD' && !(await hasRlusdTrustLine(client, config, wallet.classicAddress))) {
        const code = await openTrustLine(client, config, wallet);
        if (code !== 'tesSUCCESS') {
          return { ok: false, error: `opening the RLUSD trust line failed with ${code}` };
        }
      }

      this.ready.add(user.xrplAddress);
      return { ok: true };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }
}

/** Check whether an account exists on the validated ledger.

Args:
    client (Client): Connected client.
    address (string): Account to look up.

Returns:
    Promise<boolean>: False only when the ledger reports the account missing.

Raises:
    Error: For any other request failure.
*/
async function accountExists(client: Client, address: string): Promise<boolean> {
  try {
    await client.request({ command: 'account_info', account: address, ledger_index: 'validated' });
    return true;
  } catch (error) {
    if (isAccountNotFound(error)) return false;
    throw error;
  }
}

/** Check whether an account already trusts the RLUSD issuer.

Args:
    client (Client): Connected client.
    config (XrplConfig): Settings with the RLUSD issuer and currency.
    address (string): Account to check.

Returns:
    Promise<boolean>: True if it has an RLUSD trust line with a limit above 0.
*/
async function hasRlusdTrustLine(client: Client, config: XrplConfig, address: string): Promise<boolean> {
  const lines = await client.request({
    command: 'account_lines',
    account: address,
    peer: config.rlusdIssuer,
    ledger_index: 'validated',
  });
  return lines.result.lines.some((line) => line.currency === config.rlusdCurrency && Number(line.limit) > 0);
}

/** Open an RLUSD trust line from the wallet and wait for the result.

Args:
    client (Client): Connected client.
    config (XrplConfig): Settings with the RLUSD issuer and currency.
    wallet (Wallet): The user's wallet, which signs the TrustSet.

Returns:
    Promise<string>: The transaction's result code.
*/
async function openTrustLine(client: Client, config: XrplConfig, wallet: Wallet): Promise<string> {
  const tx: TrustSet = {
    TransactionType: 'TrustSet',
    Account: wallet.classicAddress,
    LimitAmount: { currency: config.rlusdCurrency, issuer: config.rlusdIssuer, value: USER_TRUST_LIMIT },
  };
  const result = await client.submitAndWait(tx, { wallet, autofill: true });
  const meta = result.result.meta;
  return typeof meta === 'object' && meta ? String(meta.TransactionResult) : 'unknown';
}

/** Wrap a payment service so every recipient is activated before it is paid.

Args:
    service (XrplService): The payment service to wrap.
    activator (Pick<WalletActivator, 'ensureReady'>): Makes recipients ready.

Returns:
    XrplService: The same service, except sendPayment first activates the
        recipient and reports network_error (nothing paid) if it cannot.
*/
export function withWalletActivation(
  service: XrplService,
  activator: Pick<WalletActivator, 'ensureReady'>
): XrplService {
  return {
    async sendPayment(input) {
      const ready = await activator.ensureReady(input.recipient);
      if (!ready.ok) {
        return {
          ok: false,
          reason: 'network_error',
          error: `could not activate the recipient wallet, nothing sent: ${ready.error}`,
        };
      }
      return service.sendPayment(input);
    },
    getRlusdBalance: (xrplAddress) => service.getRlusdBalance(xrplAddress),
    getPaidToday: (xrplAddress) => service.getPaidToday(xrplAddress),
    getAgentAddress: () => service.getAgentAddress(),
  };
}
