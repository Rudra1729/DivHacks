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
  /** Whether cultural visits also pay RLUSD. Off means they earn only the
      stamp, and only civic bounties pay. */
  culturalRewards: boolean;
  /** Whether Grok checks that each photo shows the place. Needs a Grok API key. */
  photoCheck: boolean;
  /** Lowest Grok confidence, from 0 to 1, at which a photo match passes. */
  photoMinConfidence: number;
}

/** Read an 'on'/'off' environment variable.

Args:
    name (string): The environment variable to read.
    fallback (boolean): The value when the variable is unset or empty.

Returns:
    boolean: True for 'on', false for 'off', otherwise the fallback.

Raises:
    ConfigError: If the variable is set to anything other than 'on' or 'off'.
*/
function loadOnOff(name: string, fallback: boolean): boolean {
  const raw = (process.env[name] ?? '').trim().toLowerCase();
  if (raw === '') {
    return fallback;
  }
  if (raw === 'on' || raw === 'off') {
    return raw === 'on';
  }
  throw new ConfigError(`${name} must be 'on' or 'off', got '${process.env[name]}'`);
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

/** Read PHOTO_MIN_CONFIDENCE, defaulting to 0.6.

Returns:
    number: The minimum confidence, from 0 to 1.

Raises:
    ConfigError: If PHOTO_MIN_CONFIDENCE is not a number from 0 to 1.
*/
function loadPhotoMinConfidence(): number {
  const raw = process.env.PHOTO_MIN_CONFIDENCE;
  if (raw === undefined || raw.trim() === '') {
    return 0.6;
  }
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ConfigError(`PHOTO_MIN_CONFIDENCE must be a number from 0 to 1, got '${raw}'`);
  }
  return value;
}

/** Build the app configuration from environment variables.

Returns:
    AppConfig: The resolved configuration.

Raises:
    ConfigError: If a treasury key is present in the environment, or
        REWARD_SCALE, LOCATION_CHECKS, CULTURAL_REWARDS, PHOTO_CHECK, or
        PHOTO_MIN_CONFIDENCE is invalid.
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
    locationChecks: loadOnOff('LOCATION_CHECKS', true),
    culturalRewards: loadOnOff('CULTURAL_REWARDS', false),
    photoCheck: loadOnOff('PHOTO_CHECK', true),
    photoMinConfidence: loadPhotoMinConfidence(),
  };
}
