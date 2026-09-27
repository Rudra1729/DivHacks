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
}

/** Build the app configuration from environment variables.

Returns:
    AppConfig: The resolved configuration.

Raises:
    ConfigError: If a treasury key is present in the environment.
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
  };
}
