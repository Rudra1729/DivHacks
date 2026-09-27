/**Ledger reads and the top-up payment for the treasury guardian.

Reads the agent wallet's recent activity into the shape the pure rules
expect, and sends the top-up from the treasury.
*/

import { Client, convertStringToHex, Payment, rippleTimeToUnixTime } from 'xrpl';
import { AgentActivity, AgentPayment } from '../src/guardian/rules';
import { GuardianConfig } from './config';

/** Transaction types that change the agent account itself. The agent should never send these. */
const DANGEROUS_TYPES = new Set([
  'AccountSet',
  'SetRegularKey',
  'SignerListSet',
  'AccountDelete',
  'TicketCreate',
  'DelegateSet',
]);

/** Memo type marking a guardian top-up on the ledger. */
export const TOPUP_MEMO_TYPE = 'guardian_topup';

const MAX_PAGES = 5;

/** Read the result code from transaction metadata.

Args:
    meta (unknown): The meta field of an account_tx entry.

Returns:
    string: The TransactionResult, or 'unknown'.
*/
function resultCodeOf(meta: unknown): string {
  if (meta && typeof meta === 'object' && 'TransactionResult' in meta) {
    return String((meta as { TransactionResult: string }).TransactionResult);
  }
  return 'unknown';
}

/** Turn a ledger amount into a number, if it is RLUSD.

Args:
    config (GuardianConfig): Settings with the RLUSD issuer and currency code.
    amount (unknown): An Amount or delivered_amount field.

Returns:
    { value: number; isRlusd: boolean }: The numeric value, and whether it was RLUSD.
*/
function readAmount(config: GuardianConfig, amount: unknown): { value: number; isRlusd: boolean } {
  if (amount && typeof amount === 'object') {
    const { currency, issuer, value } = amount as { currency?: string; issuer?: string; value?: string };
    if (currency === config.xrpl.rlusdCurrency && issuer === config.xrpl.rlusdIssuer) {
      return { value: Number(value), isRlusd: true };
    }
  }
  return { value: 0, isRlusd: false };
}

/** Read what the agent wallet did within a time window, plus its trust line limit.

Args:
    client (Client): Connected client.
    config (GuardianConfig): Guardian settings.
    since (Date): Start of the window.

Returns:
    Promise<AgentActivity>: The agent's payments, account changes, and trust limit.
*/
export async function readAgentActivity(client: Client, config: GuardianConfig, since: Date): Promise<AgentActivity> {
  const agent = config.agentAddress;
  const payments: AgentPayment[] = [];
  const dangerousTransactions: string[] = [];
  let marker: unknown = undefined;

  for (let page = 0; page < MAX_PAGES; page += 1) {
    const response = await client.request({
      command: 'account_tx',
      account: agent,
      ledger_index_min: -1,
      ledger_index_max: -1,
      forward: false,
      limit: 200,
      marker,
    });

    for (const entry of response.result.transactions) {
      const tx = (entry.tx_json ?? {}) as Partial<Payment> & { date?: number };
      const iso = (entry as { close_time_iso?: string }).close_time_iso;
      const closedAt = iso ? Date.parse(iso) : rippleTimeToUnixTime(tx.date ?? 0);
      if (closedAt < since.getTime()) {
        return { payments, dangerousTransactions, trustLimit: await readTrustLimit(client, config) };
      }
      if (tx.Account !== agent) continue;

      const hash = entry.hash ?? 'unknown';
      const type = String(tx.TransactionType);
      if (type === 'Payment') {
        const code = resultCodeOf(entry.meta);
        const delivered = (entry.meta as { delivered_amount?: unknown } | undefined)?.delivered_amount;
        const amount = readAmount(config, code === 'tesSUCCESS' ? delivered : tx.Amount);
        payments.push({ hash, to: String(tx.Destination), amount: amount.value, isRlusd: amount.isRlusd, resultCode: code });
      } else if (DANGEROUS_TYPES.has(type) && resultCodeOf(entry.meta) === 'tesSUCCESS') {
        dangerousTransactions.push(`${type} ${hash}`);
      }
    }

    marker = response.result.marker;
    if (!marker) break;
  }
  return { payments, dangerousTransactions, trustLimit: await readTrustLimit(client, config) };
}

/** Read the agent's RLUSD trust line limit.

Args:
    client (Client): Connected client.
    config (GuardianConfig): Guardian settings.

Returns:
    Promise<number | null>: The limit, or null if the agent has no RLUSD trust line.
*/
async function readTrustLimit(client: Client, config: GuardianConfig): Promise<number | null> {
  const lines = await client.request({
    command: 'account_lines',
    account: config.agentAddress,
    peer: config.xrpl.rlusdIssuer,
    ledger_index: 'validated',
  });
  const line = lines.result.lines.find((l) => l.currency === config.xrpl.rlusdCurrency);
  return line ? Number(line.limit) : null;
}

/** Send RLUSD from the treasury to the agent wallet and wait for the ledger's answer.

Args:
    client (Client): Connected client.
    config (GuardianConfig): Guardian settings, holding the treasury wallet.
    amount (string): Amount to send, as a decimal string with at most 2 decimals.

Returns:
    Promise<{ ok: boolean; code: string; hash: string }>: The ledger result. The
        code is 'error' and the hash empty if the outcome could not be read.
*/
export async function sendTopUp(
  client: Client,
  config: GuardianConfig,
  amount: string
): Promise<{ ok: boolean; code: string; hash: string }> {
  const tx: Payment = {
    TransactionType: 'Payment',
    Account: config.treasury.classicAddress,
    Destination: config.agentAddress,
    Amount: { currency: config.xrpl.rlusdCurrency, issuer: config.xrpl.rlusdIssuer, value: amount },
    Memos: [{ Memo: { MemoType: convertStringToHex(TOPUP_MEMO_TYPE), MemoData: convertStringToHex(`topup ${amount}`) } }],
  };
  try {
    const result = await client.submitAndWait(tx, { wallet: config.treasury, autofill: true });
    const code = resultCodeOf(result.result.meta);
    return { ok: code === 'tesSUCCESS', code, hash: result.result.hash };
  } catch (error) {
    return { ok: false, code: `error: ${String(error)}`, hash: '' };
  }
}
