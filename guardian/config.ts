/**Configuration for the treasury guardian process.

The guardian is the only process that holds the treasury key. It reads its
own settings file (.env.guardian) and never the server's .env. It also
refuses to start if it finds the agent's seed, so the two keys can never
end up in the same process.
*/

import { Wallet } from 'xrpl';
import { GuardianLimits } from '../src/guardian/rules';
import { loadXrplConfig, XrplConfig } from '../src/xrpl/config';

/** Raised when the guardian's settings are missing or break a safety rule. */
export class GuardianConfigError extends Error {}

/** Resolved guardian settings.

Attributes:
    xrpl (XrplConfig): Network, issuer, and currency settings shared with the payments module.
    treasury (Wallet): The treasury wallet, the source of every top-up.
    agentAddress (string): Address of the agent wallet being topped up. A public
        address only, never the agent's seed.
    limits (GuardianLimits): Allowance and abnormal-spending limits.
    intervalSeconds (number): Seconds between cycles when running continuously.
*/
export interface GuardianConfig {
  xrpl: XrplConfig;
  treasury: Wallet;
  agentAddress: string;
  limits: GuardianLimits;
  intervalSeconds: number;
}

/** Read a positive number from an environment variable.

Args:
    env (NodeJS.ProcessEnv): Environment to read.
    name (string): Variable name.
    fallback (number): Value when the variable is not set.

Returns:
    number: The parsed value or the fallback.

Raises:
    GuardianConfigError: If the variable is set but is not a positive number.
*/
function positiveNumber(env: NodeJS.ProcessEnv, name: string, fallback: number): number {
  const raw = env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0) {
    throw new GuardianConfigError(`${name} must be a positive number, got '${raw}'`);
  }
  return value;
}

/** Build the guardian configuration from environment variables.

Args:
    env (NodeJS.ProcessEnv): Environment to read. Defaults to process.env.

Returns:
    GuardianConfig: The resolved configuration.

Raises:
    GuardianConfigError: If TREASURY_SEED or AGENT_ADDRESS is missing or
        invalid, or if AGENT_SEED is present in this process.
*/
export function loadGuardianConfig(env: NodeJS.ProcessEnv = process.env): GuardianConfig {
  if (env.AGENT_SEED) {
    throw new GuardianConfigError(
      'Refusing to start: AGENT_SEED found in guardian config. The guardian must never hold the agent key.'
    );
  }
  if (!env.TREASURY_SEED) {
    throw new GuardianConfigError('TREASURY_SEED is missing. Put it in .env.guardian, never in the server .env.');
  }
  if (!env.AGENT_ADDRESS) {
    throw new GuardianConfigError('AGENT_ADDRESS is missing. It is the public address of the agent wallet.');
  }

  let treasury: Wallet;
  try {
    treasury = Wallet.fromSeed(env.TREASURY_SEED);
  } catch {
    throw new GuardianConfigError('TREASURY_SEED is not a valid XRPL seed.');
  }
  if (treasury.classicAddress === env.AGENT_ADDRESS) {
    throw new GuardianConfigError('AGENT_ADDRESS is the treasury address. They must be different wallets.');
  }

  const xrpl = { ...loadXrplConfig({ ...env, XRPL_MODE: 'fake' }), agentAddress: env.AGENT_ADDRESS };
  return {
    xrpl,
    treasury,
    agentAddress: env.AGENT_ADDRESS,
    intervalSeconds: positiveNumber(env, 'GUARDIAN_INTERVAL_SECONDS', 180),
    limits: {
      targetBalance: positiveNumber(env, 'GUARDIAN_TARGET_BALANCE', 10),
      windowMinutes: positiveNumber(env, 'GUARDIAN_WINDOW_MINUTES', 30),
      maxWindowSpend: positiveNumber(env, 'GUARDIAN_MAX_WINDOW_SPEND', 30),
      maxSinglePayment: positiveNumber(env, 'GUARDIAN_MAX_SINGLE_PAYMENT', 5),
      knownRecipients: (env.GUARDIAN_KNOWN_RECIPIENTS ?? '')
        .split(',')
        .map((address) => address.trim())
        .filter(Boolean),
    },
  };
}
