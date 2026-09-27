/**Shared XRPL connection and ledger read helpers.

One WebSocket connection is reused by the payment service, the guardian,
and the scripts. Reads here work for both RLUSD and the XRP fallback.
*/

import { Client, dropsToXrp } from 'xrpl';
import { XrplConfig } from './config';

let client: Client | null = null;
let connecting: Promise<void> | null = null;

/** Get a connected XRPL client, connecting on first use.

Args:
    config (XrplConfig): Settings holding the WebSocket URL.

Returns:
    Promise<Client>: A connected client shared across callers.
*/
export async function getClient(config: XrplConfig): Promise<Client> {
  if (!client || client.url !== config.wsUrl) {
    client = new Client(config.wsUrl);
    connecting = null;
  }
  if (!client.isConnected()) {
    connecting = connecting ?? client.connect().finally(() => (connecting = null));
    await connecting;
  }
  return client;
}

/** Close the shared connection. Used by scripts and tests on exit. */
export async function disconnectClient(): Promise<void> {
  if (client?.isConnected()) {
    await client.disconnect();
  }
  client = null;
}

/** Read a wallet's balance in the configured reward asset.

Args:
    xrplClient (Client): Connected client.
    config (XrplConfig): Settings with the asset, issuer, and currency code.
    address (string): Wallet to read.

Returns:
    Promise<number>: Balance in RLUSD (or XRP in fallback mode), 0 if the
        wallet does not exist or has no trust line.
*/
export async function readAssetBalance(
  xrplClient: Client,
  config: XrplConfig,
  address: string
): Promise<number> {
  try {
    if (config.asset === 'XRP') {
      const info = await xrplClient.request({
        command: 'account_info',
        account: address,
        ledger_index: 'validated',
      });
      return Number(dropsToXrp(info.result.account_data.Balance));
    }
    const lines = await xrplClient.request({
      command: 'account_lines',
      account: address,
      peer: config.rlusdIssuer,
      ledger_index: 'validated',
    });
    const line = lines.result.lines.find((l) => l.currency === config.rlusdCurrency);
    return line ? Number(line.balance) : 0;
  } catch (error) {
    if (isAccountNotFound(error)) {
      return 0;
    }
    throw error;
  }
}

/** Check whether an XRPL request failed because the account does not exist.

Args:
    error (unknown): Error thrown by a client request.

Returns:
    boolean: True for actNotFound errors.
*/
export function isAccountNotFound(error: unknown): boolean {
  const data = (error as { data?: { error?: string } })?.data;
  return data?.error === 'actNotFound';
}
