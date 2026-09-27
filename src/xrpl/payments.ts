/**Real payment service: pays rewards from the agent wallet on XRPL testnet.

The agent wallet only ever holds a small allowance, topped up by the
guardian. If a payment asks for more than that, the ledger refuses it
(tecPATH_PARTIAL for RLUSD), no matter what the agent or policy decided.

The decision ID is the idempotency key. A decision is never paid twice:
repeat calls reuse the first attempt in memory, and before sending, the
agent wallet's history is searched for a payment carrying the same
decision ID memo, which also covers a server restart.
*/

import {
  Client,
  convertStringToHex,
  dropsToXrp,
  isValidClassicAddress,
  Payment,
  rippleTimeToUnixTime,
  Wallet,
  xrpToDrops,
} from 'xrpl';
import { amountProblem, formatAmount, startOfUtcDay } from './amount';
import { getClient, readAssetBalance } from './client';
import { loadXrplConfig, XrplConfig } from './config';
import { SerialQueue } from './queue';
import { PaymentService, SendPaymentInput, SendPaymentResult } from './types';

const POLL_INTERVAL_MS = 1000;
const CONFIRM_TIMEOUT_MS = 60_000;
const RECHECK_TIMEOUT_MS = 5_000;
const HISTORY_PAGES_TO_SEARCH = 5;

/** Codes returned at submit time for transactions that never reach the ledger. */
const NOT_APPLIED_PREFIXES = ['tem', 'tef', 'tel'];

/** Memo type under which the decision ID is stored on every payment. */
export const DECISION_MEMO_TYPE = 'decision_id';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Build the payment amount in the configured asset.

Args:
    config (XrplConfig): Settings with the asset, issuer, and currency code.
    amount (number): Valid reward amount.

Returns:
    Payment['Amount']: Issued-currency object for RLUSD, drops string for XRP.
*/
function toLedgerAmount(config: XrplConfig, amount: number): Payment['Amount'] {
  if (config.asset === 'XRP') {
    return xrpToDrops(formatAmount(amount));
  }
  return { currency: config.rlusdCurrency, issuer: config.rlusdIssuer, value: formatAmount(amount) };
}

/** Read the final result code from transaction metadata.

Args:
    meta (unknown): The meta field of a tx response.

Returns:
    string: The TransactionResult, or 'unknown'.
*/
function resultCodeOf(meta: unknown): string {
  if (meta && typeof meta === 'object' && 'TransactionResult' in meta) {
    return String((meta as { TransactionResult: string }).TransactionResult);
  }
  return 'unknown';
}

/** Turn a validated transaction's result code into a payment result.

Args:
    txHash (string): Hash of the validated transaction.
    code (string): Its TransactionResult.

Returns:
    SendPaymentResult: Success for tesSUCCESS, otherwise a ledger rejection.
*/
function finalResult(txHash: string, code: string): SendPaymentResult {
  if (code === 'tesSUCCESS') {
    return { ok: true, txHash, resultCode: 'tesSUCCESS' };
  }
  return { ok: false, reason: 'ledger_rejected', resultCode: code, txHash, error: `ledger rejected the payment with ${code}` };
}

/** Wait until a submitted transaction is final, expired, or the wait times out.

Never throws.

Args:
    client (Client): Connected client.
    txHash (string): Hash of the submitted transaction.
    lastLedger (number | undefined): Its LastLedgerSequence, if known. Past
        this ledger an unincluded transaction can never apply.
    timeoutMs (number): How long to wait before reporting unconfirmed.

Returns:
    Promise<SendPaymentResult>: Final result, network_error if it expired
        unapplied, or unconfirmed if the wait timed out.
*/
async function waitForOutcome(
  client: Client,
  txHash: string,
  lastLedger: number | undefined,
  timeoutMs: number
): Promise<SendPaymentResult> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const response = await client.request({ command: 'tx', transaction: txHash });
      if (response.result.validated) {
        return finalResult(txHash, resultCodeOf(response.result.meta));
      }
    } catch (error) {
      if ((error as { data?: { error?: string } })?.data?.error !== 'txnNotFound' || lastLedger === undefined) {
        continue;
      }
      const validated = await client.getLedgerIndex().catch(() => 0);
      if (validated > lastLedger) {
        return {
          ok: false,
          reason: 'network_error',
          resultCode: 'tefMAX_LEDGER',
          txHash,
          error: 'payment expired without being included in a ledger, nothing was paid',
        };
      }
    }
  }
  return { ok: false, reason: 'unconfirmed', txHash, error: 'submitted but not confirmed yet, it may still succeed' };
}

/** Payment service backed by the XRPL testnet.

Attributes:
    queue (SerialQueue): Sends agent payments one at a time.
    attempts (Map<string, Promise<SendPaymentResult>>): Latest attempt per decision ID.
    lastLedgers (Map<string, number>): LastLedgerSequence of submitted payments, per decision ID.
*/
export class RealPaymentService implements PaymentService {
  private queue = new SerialQueue();
  private attempts = new Map<string, Promise<SendPaymentResult>>();
  private lastLedgers = new Map<string, number>();

  /** Pay a reward from the agent wallet with the decision ID in a memo.

  The recipient is paid exactly as given; only its format is checked.
  Repeat calls with the same decision ID never send a second payment: a
  final result is returned as is, an unconfirmed one is re-checked on the
  ledger, and only a network_error (nothing paid) is attempted again.

  Args:
      input (SendPaymentInput): Decision ID, recipient, and amount.

  Returns:
      Promise<SendPaymentResult>: Transaction hash, or a failure reason.
  */
  async sendPayment(input: SendPaymentInput): Promise<SendPaymentResult> {
    const problem = amountProblem(input.amount);
    if (problem) {
      return { ok: false, reason: 'invalid_input', error: problem };
    }
    if (!isValidClassicAddress(input.recipient)) {
      return { ok: false, reason: 'invalid_input', error: `not a valid XRPL address: ${input.recipient}` };
    }

    for (;;) {
      const previous = this.attempts.get(input.decisionId);
      if (!previous) break;
      const result = await previous;
      if (this.attempts.get(input.decisionId) !== previous) continue;
      if (result.ok || result.reason === 'ledger_rejected') return result;
      if (result.reason === 'unconfirmed') {
        const recheck = this.queue.run(() => this.recheck(input.decisionId, result));
        this.attempts.set(input.decisionId, recheck);
        return recheck;
      }
      break;
    }

    const attempt = this.queue.run(() => this.payOnce(input));
    this.attempts.set(input.decisionId, attempt);
    return attempt;
  }

  /** Send one payment, unless the ledger already has one for this decision.

  Runs inside the queue. Never throws.

  Args:
      input (SendPaymentInput): Decision ID, recipient, and amount.

  Returns:
      Promise<SendPaymentResult>: The earlier on-ledger result, or the new one.
  */
  private async payOnce(input: SendPaymentInput): Promise<SendPaymentResult> {
    const config = loadXrplConfig();
    let client: Client;
    try {
      client = await getClient(config);
    } catch (error) {
      return { ok: false, reason: 'network_error', error: `could not connect to XRPL, nothing sent: ${String(error)}` };
    }

    try {
      const earlier = await findDecisionOnLedger(client, config, input.decisionId);
      if (earlier) return earlier;
    } catch (error) {
      return { ok: false, reason: 'network_error', error: `could not check payment history, nothing sent: ${String(error)}` };
    }

    const wallet = Wallet.fromSeed(config.agentSeed);
    const tx: Payment = {
      TransactionType: 'Payment',
      Account: wallet.classicAddress,
      Destination: input.recipient,
      Amount: toLedgerAmount(config, input.amount),
      Memos: [{ Memo: { MemoType: memoTypeHex(), MemoData: convertStringToHex(input.decisionId) } }],
    };

    let txBlob: string;
    let txHash: string;
    let lastLedger: number | undefined;
    try {
      const prepared = await client.autofill(tx);
      lastLedger = prepared.LastLedgerSequence;
      ({ tx_blob: txBlob, hash: txHash } = wallet.sign(prepared));
    } catch (error) {
      return { ok: false, reason: 'network_error', error: `could not prepare payment, nothing sent: ${String(error)}` };
    }
    if (lastLedger !== undefined) {
      this.lastLedgers.set(input.decisionId, lastLedger);
    }

    try {
      const submitted = await client.request({ command: 'submit', tx_blob: txBlob });
      const code = submitted.result.engine_result;
      if (NOT_APPLIED_PREFIXES.some((prefix) => code.startsWith(prefix))) {
        return {
          ok: false,
          reason: 'ledger_rejected',
          resultCode: code,
          error: `ledger refused the payment before applying it: ${submitted.result.engine_result_message}`,
        };
      }
    } catch (error) {
      return { ok: false, reason: 'unconfirmed', txHash, error: `submit may not have reached the ledger: ${String(error)}` };
    }

    return waitForOutcome(client, txHash, lastLedger, CONFIRM_TIMEOUT_MS);
  }

  /** Re-check an unconfirmed payment on the ledger without sending anything.

  Runs inside the queue. Never throws.

  Args:
      decisionId (string): Decision whose payment is being checked.
      previous (SendPaymentResult): The earlier unconfirmed result.

  Returns:
      Promise<SendPaymentResult>: Final result, network_error if it expired
          unapplied, or the unconfirmed result if still unknown.
  */
  private async recheck(decisionId: string, previous: SendPaymentResult): Promise<SendPaymentResult> {
    if (previous.ok || !previous.txHash) return previous;
    try {
      const client = await getClient(loadXrplConfig());
      return await waitForOutcome(client, previous.txHash, this.lastLedgers.get(decisionId), RECHECK_TIMEOUT_MS);
    } catch {
      return previous;
    }
  }

  /** Read a wallet's RLUSD balance from the validated ledger.

  Args:
      xrplAddress (string): Wallet to read.

  Returns:
      Promise<number>: Balance in RLUSD (XRP in fallback mode).
  */
  async getRlusdBalance(xrplAddress: string): Promise<number> {
    const config = loadXrplConfig();
    return readAssetBalance(await getClient(config), config, xrplAddress);
  }

  /** Total the agent paid to a wallet since 00:00 UTC today, read from the ledger.

  Walks the agent wallet's history newest first and stops at midnight UTC.
  Counts only successful payments, using the amount actually delivered.

  Args:
      xrplAddress (string): Recipient wallet.

  Returns:
      Promise<number>: Sum of today's successful payments to the wallet.
  */
  async getPaidToday(xrplAddress: string): Promise<number> {
    const config = loadXrplConfig();
    const client = await getClient(config);
    const since = startOfUtcDay().getTime();
    let total = 0;
    let marker: unknown = undefined;

    for (;;) {
      const response = await client.request({
        command: 'account_tx',
        account: config.agentAddress,
        ledger_index_min: -1,
        ledger_index_max: -1,
        forward: false,
        limit: 200,
        marker,
      });

      for (const entry of response.result.transactions) {
        const tx = (entry.tx_json ?? {}) as Partial<Payment> & { date?: number };
        const closeTimeIso = (entry as { close_time_iso?: string }).close_time_iso;
        const closedAt = closeTimeIso ? Date.parse(closeTimeIso) : rippleTimeToUnixTime(tx.date ?? 0);
        if (closedAt < since) {
          return round2(total);
        }
        if (tx.TransactionType !== 'Payment' || tx.Account !== config.agentAddress) continue;
        if (tx.Destination !== xrplAddress) continue;
        if (resultCodeOf(entry.meta) !== 'tesSUCCESS') continue;
        total += deliveredAmount(config, (entry.meta as { delivered_amount?: unknown }).delivered_amount);
      }

      marker = response.result.marker;
      if (!marker) {
        return round2(total);
      }
    }
  }
}

function memoTypeHex(): string {
  return convertStringToHex(DECISION_MEMO_TYPE);
}

/** Search the agent wallet's recent history for a payment with this decision ID.

Args:
    client (Client): Connected client.
    config (XrplConfig): Settings with the agent address.
    decisionId (string): Decision to look for.

Returns:
    Promise<SendPaymentResult | null>: The validated payment's result, or
        null if none was found in the recent pages.
*/
async function findDecisionOnLedger(
  client: Client,
  config: XrplConfig,
  decisionId: string
): Promise<SendPaymentResult | null> {
  const typeHex = memoTypeHex().toUpperCase();
  const dataHex = convertStringToHex(decisionId).toUpperCase();
  let marker: unknown = undefined;

  for (let page = 0; page < HISTORY_PAGES_TO_SEARCH; page += 1) {
    const response = await client.request({
      command: 'account_tx',
      account: config.agentAddress,
      ledger_index_min: -1,
      ledger_index_max: -1,
      forward: false,
      limit: 200,
      marker,
    });

    for (const entry of response.result.transactions) {
      const tx = (entry.tx_json ?? {}) as Partial<Payment>;
      if (tx.TransactionType !== 'Payment' || tx.Account !== config.agentAddress) continue;
      const matches = (tx.Memos ?? []).some(
        ({ Memo }) => Memo.MemoType?.toUpperCase() === typeHex && Memo.MemoData?.toUpperCase() === dataHex
      );
      if (matches && entry.hash) {
        return finalResult(entry.hash, resultCodeOf(entry.meta));
      }
    }

    marker = response.result.marker;
    if (!marker) break;
  }
  return null;
}

/** Convert a delivered_amount field into a number in the reward asset.

Args:
    config (XrplConfig): Settings with the asset, issuer, and currency code.
    delivered (unknown): delivered_amount from transaction metadata.

Returns:
    number: Amount delivered in the reward asset, 0 for other assets.
*/
function deliveredAmount(config: XrplConfig, delivered: unknown): number {
  if (config.asset === 'XRP') {
    return typeof delivered === 'string' ? Number(dropsToXrp(delivered)) : 0;
  }
  if (delivered && typeof delivered === 'object') {
    const { currency, issuer, value } = delivered as { currency?: string; issuer?: string; value?: string };
    if (currency === config.rlusdCurrency && issuer === config.rlusdIssuer) {
      return Number(value);
    }
  }
  return 0;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** Shared real service used when XRPL_MODE=real. */
export const realPaymentService = new RealPaymentService();
