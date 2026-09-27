/**XRPL configuration, loaded from environment variables.

This is the only file in the XRPL module that reads process.env.
Fake mode needs nothing configured. Real mode fails fast if the agent
wallet seed is missing. The treasury seed is never read here: it lives
only in the guardian process.
*/

import { Wallet } from 'xrpl';

/** Raised when the XRPL config is missing something real mode needs. */
export class XrplConfigError extends Error {}

/** Which payment implementation to use. */
export type XrplMode = 'fake' | 'real';

/** Which asset rewards are paid in. XRP is the fallback if RLUSD setup is blocked. */
export type PaymentAsset = 'RLUSD' | 'XRP';

/** Resolved XRPL settings.

Attributes:
    mode (XrplMode): 'real' pays on XRPL testnet, 'fake' keeps balances in memory.
    wsUrl (string): XRPL WebSocket endpoint.
    asset (PaymentAsset): Asset used for rewards.
    rlusdIssuer (string): Address of the RLUSD issuer on testnet.
    rlusdCurrency (string): 40-character hex currency code for RLUSD.
    agentSeed (string): Secret seed of the agent wallet. Empty in fake mode.
    agentAddress (string): Address of the agent wallet.
    fakeAgentBalance (number): Starting agent balance in fake mode.
*/
export interface XrplConfig {
  mode: XrplMode;
  wsUrl: string;
  asset: PaymentAsset;
  rlusdIssuer: string;
  rlusdCurrency: string;
  agentSeed: string;
  agentAddress: string;
  fakeAgentBalance: number;
}

export const DEFAULT_WS_URL = 'wss://s.altnet.rippletest.net:51233';

/** RLUSD issuer on XRPL testnet, checked on-ledger with gateway_balances. */
export const TESTNET_RLUSD_ISSUER = 'rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV';

/** "RLUSD" as a 40-character hex code, required for codes longer than 3 letters. */
export const RLUSD_CURRENCY_HEX = '524C555344000000000000000000000000000000';

export const FAKE_AGENT_ADDRESS = 'rFakeAgentWebPassNYC000000000000';

/** Build the XRPL configuration from environment variables.

Args:
    env (NodeJS.ProcessEnv): Environment to read. Defaults to process.env.

Returns:
    XrplConfig: The resolved configuration.

Raises:
    XrplConfigError: If XRPL_MODE or XRPL_ASSET is invalid, or if real mode
        is on and AGENT_SEED is missing or not a valid seed.
*/
export function loadXrplConfig(env: NodeJS.ProcessEnv = process.env): XrplConfig {
  const mode = (env.XRPL_MODE ?? 'fake').toLowerCase();
  if (mode !== 'fake' && mode !== 'real') {
    throw new XrplConfigError(`XRPL_MODE must be 'fake' or 'real', got '${env.XRPL_MODE}'`);
  }

  const asset = (env.XRPL_ASSET ?? 'RLUSD').toUpperCase();
  if (asset !== 'RLUSD' && asset !== 'XRP') {
    throw new XrplConfigError(`XRPL_ASSET must be 'RLUSD' or 'XRP', got '${env.XRPL_ASSET}'`);
  }

  const agentSeed = env.AGENT_SEED ?? '';
  let agentAddress = FAKE_AGENT_ADDRESS;
  if (mode === 'real') {
    if (!agentSeed) {
      throw new XrplConfigError(
        'XRPL_MODE=real needs AGENT_SEED. Run npm run xrpl:setup and copy the printed value into .env.'
      );
    }
    try {
      agentAddress = Wallet.fromSeed(agentSeed).classicAddress;
    } catch {
      throw new XrplConfigError('AGENT_SEED is not a valid XRPL seed.');
    }
  }

  return {
    mode,
    wsUrl: env.XRPL_WS_URL || DEFAULT_WS_URL,
    asset,
    rlusdIssuer: env.RLUSD_ISSUER || TESTNET_RLUSD_ISSUER,
    rlusdCurrency: env.RLUSD_CURRENCY || RLUSD_CURRENCY_HEX,
    agentSeed,
    agentAddress,
    fakeAgentBalance: Number(env.XRPL_FAKE_AGENT_BALANCE ?? 10),
  };
}
