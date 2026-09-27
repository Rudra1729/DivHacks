/**Server configuration, loaded from environment variables.

This module is the single place that reads process.env. It also enforces
the key handling rule from the PRD: the server must refuse to start if a
treasury secret key is present in its own configuration, since the
treasury key must live only in the guardian process.
*/

/** Raised when the server config violates a hard safety rule. */
export class ConfigError extends Error {}

const TREASURY_KEY_ENV_VARS = [
  'TREASURY_SECRET_KEY',
  'TREASURY_SEED',
  'TREASURY_PRIVATE_KEY',
];

function assertNoTreasuryKey(): void {
  const found = TREASURY_KEY_ENV_VARS.find((name) => Boolean(process.env[name]));
  if (found) {
    throw new ConfigError(
      `Refusing to start: treasury key found in server config (${found}). ` +
        'The treasury key must live only in the guardian process.'
    );
  }
}

export interface AppConfig {
  port: number;
  dbPath: string;
  isTestMode: boolean;
  maxUploadBytes: number;
  /** Grok API key. Unset means the agent always uses its fallback payout. */
  grokApiKey?: string;
  grokModel: string;
  grokEndpoint: string;
  /** Multiplier on each place's base reward before Grok sees it, in (0, 1].
      Lets test runs pay proportionally less while Grok still decides. */
  rewardScale: number;
  /** Whether Sentinel runs the location plausibility checks (GPS trail,
      accuracy, typed coordinates, impossible travel, clusters). */
  locationChecks: boolean;
}

/** Read LOCATION_CHECKS, defaulting to on.

Returns:
    boolean: False only when LOCATION_CHECKS is 'off'.

Raises:
    ConfigError: If LOCATION_CHECKS is set to anything other than 'on' or 'off'.
*/
function loadLocationChecks(): boolean {
  const raw = (process.env.LOCATION_CHECKS ?? '').trim().toLowerCase();
  if (raw === '' || raw === 'on') {
    return true;
  }
  if (raw === 'off') {
    return false;
  }
  throw new ConfigError(`LOCATION_CHECKS must be 'on' or 'off', got '${process.env.LOCATION_CHECKS}'`);
}

/** Read REWARD_SCALE, defaulting to 1 (full rewards).

Returns:
    number: The scale, greater than 0 and at most 1.

Raises:
    ConfigError: If REWARD_SCALE is not a number in (0, 1].
*/
function loadRewardScale(): number {
  const raw = process.env.REWARD_SCALE;
  if (raw === undefined || raw.trim() === '') {
    return 1;
  }
  const scale = Number(raw);
  if (!Number.isFinite(scale) || scale <= 0 || scale > 1) {
    throw new ConfigError(`REWARD_SCALE must be a number greater than 0 and at most 1, got '${raw}'`);
  }
  return scale;
}

/** Build the app configuration from environment variables.

Returns:
    AppConfig: The resolved configuration.

Raises:
    ConfigError: If a treasury key is present in the environment, or
        REWARD_SCALE or LOCATION_CHECKS is invalid.
*/
export function loadConfig(): AppConfig {
  assertNoTreasuryKey();

  return {
    port: Number(process.env.PORT ?? 3000),
    dbPath: process.env.DB_PATH ?? 'webpass.sqlite',
    isTestMode: process.env.NODE_ENV === 'test',
    maxUploadBytes: Number(process.env.MAX_UPLOAD_BYTES ?? 5 * 1024 * 1024),
    grokApiKey: process.env.GROK_API_KEY,
    grokModel: process.env.GROK_MODEL ?? 'grok-4',
    grokEndpoint: process.env.GROK_ENDPOINT ?? 'https://api.x.ai/v1/chat/completions',
    rewardScale: loadRewardScale(),
    locationChecks: loadLocationChecks(),
  };
}
