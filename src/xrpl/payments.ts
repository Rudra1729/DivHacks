/**Real payment service: pays rewards from the agent wallet on XRPL testnet.

The agent wallet only ever holds a small allowance, topped up by the
guardian. If a payment asks for more than that, the ledger refuses it
(tecPATH_PARTIAL for RLUSD), no matter what the agent or policy decided.
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

/** Sign, submit, and wait until the transaction is final on the ledger.

Never throws. The caller must run this inside the payment queue.

Args:
    client (Client): Connected client.
    wallet (Wallet): Sending wallet.
    tx (Payment): Unsigned payment.

Returns:
    Promise<SendPaymentResult>: Success, a ledger rejection, or a network error.
*/
async function submitAndConfirm(client: Client, wallet: Wallet, tx: Payment): Promise<SendPaymentResult> {
  let txBlob: string;
  let txHash: string;
  let lastLedger: number;
  try {
    const prepared = await client.autofill(tx);
    lastLedger = prepared.LastLedgerSequence ?? 0;
    ({ tx_blob: txBlob, hash: txHash } = wallet.sign(prepared));
  } catch (error) {
    return { ok: false, reason: 'network_error', error: `could not prepare payment: ${String(error)}` };
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
    return { ok: false, reason: 'network_error', txHash, error: `submit failed, outcome unknown: ${String(error)}` };
  }

  const deadline = Date.now() + CONFIRM_TIMEOUT_MS;
  while (Date.now() < deadline) {
    await sleep(POLL_INTERVAL_MS);
    try {
      const response = await client.request({ command: 'tx', transaction: txHash });
      if (response.result.validated) {
        const code = resultCodeOf(response.result.meta);
        if (code === 'tesSUCCESS') {
          return { ok: true, txHash, resultCode: 'tesSUCCESS' };
        }
        return { ok: false, reason: 'ledger_rejected', resultCode: code, txHash, error: `ledger rejected the payment with ${code}` };
      }
    } catch (error) {
      if ((error as { data?: { error?: string } })?.data?.error !== 'txnNotFound') {
        continue;
      }
      const validated = await client.getLedgerIndex().catch(() => 0);
      if (validated > lastLedger) {
        return {
          ok: false,
          reason: 'ledger_rejected',
          resultCode: 'tefMAX_LEDGER',
          error: 'payment expired without being included in a ledger, nothing was sent',
        };
      }
    }
  }
  return { ok: false, reason: 'network_error', txHash, error: 'timed out waiting for the ledger, outcome unknown' };
}

/** Payment service backed by the XRPL testnet.

Attributes:
    queue (SerialQueue): Sends agent payments one at a time.
*/
export class RealPaymentService implements PaymentService {
  private queue = new SerialQueue();

  /** Pay a reward from the agent wallet with the decision ID in a memo.

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
    if (!isValidClassicAddress(input.userXrplAddress)) {
      return { ok: false, reason: 'invalid_input', error: `not a valid XRPL address: ${input.userXrplAddress}` };
    }

    const config = loadXrplConfig();
    const wallet = Wallet.fromSeed(config.agentSeed);
    const tx: Payment = {
      TransactionType: 'Payment',
      Account: wallet.classicAddress,
      Destination: input.userXrplAddress,
      Amount: toLedgerAmount(config, input.amount),
      Memos: [
        {
          Memo: {
            MemoType: convertStringToHex(DECISION_MEMO_TYPE),
            MemoData: convertStringToHex(input.decisionId),
          },
        },
      ],
    };

    return this.queue.run(async () => {
      let client: Client;
      try {
        client = await getClient(config);
      } catch (error) {
        return { ok: false, reason: 'network_error', error: `could not connect to XRPL: ${String(error)}` };
      }
      return submitAndConfirm(client, wallet, tx);
    });
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
