/**Solana configuration, loaded from environment variables.

This is the only file in the Solana module that reads process.env.
Fake mode needs nothing configured. Real mode fails fast if the
neighborhood collections are missing.
*/

/** Raised when the Solana config is missing something real mode needs. */
export class SolanaConfigError extends Error {}

/** Which stamp implementation to use. */
export type SolanaMode = 'fake' | 'real';

/** Resolved Solana settings.

Attributes:
    mode (SolanaMode): 'real' mints on devnet, 'fake' keeps stamps in memory.
    rpcUrl (string): Solana RPC endpoint.
    issuerKeypairPath (string): JSON keypair file for the issuer wallet.
    collections (object): Collection addresses for Harlem and Morningside Heights.
    metadataBaseUrl (string): Base URL of the metadata pages, without a trailing slash.
    forceFail (boolean): When true, every mint fails. Used by the Solana-failure test.
*/
export interface SolanaConfig {
  mode: SolanaMode;
  rpcUrl: string;
  issuerKeypairPath: string;
  collections: { harlem: string; morningside: string };
  metadataBaseUrl: string;
  forceFail: boolean;
}

export const DEFAULT_RPC_URL = 'https://api.devnet.solana.com';

/** Build the Solana configuration from environment variables.

Args:
    env (NodeJS.ProcessEnv): Environment to read. Defaults to process.env.

Returns:
    SolanaConfig: The resolved configuration.

Raises:
    SolanaConfigError: If SOLANA_MODE is not 'fake' or 'real', or if real
        mode is on and a collection address is missing.
*/
export function loadSolanaConfig(env: NodeJS.ProcessEnv = process.env): SolanaConfig {
  const mode = (env.SOLANA_MODE ?? 'fake').toLowerCase();
  if (mode !== 'fake' && mode !== 'real') {
    throw new SolanaConfigError(`SOLANA_MODE must be 'fake' or 'real', got '${env.SOLANA_MODE}'`);
  }

  const config: SolanaConfig = {
    mode,
    rpcUrl: env.SOLANA_RPC_URL || DEFAULT_RPC_URL,
    issuerKeypairPath: env.SOLANA_ISSUER_KEYPAIR_PATH || '.keys/issuer.json',
    collections: {
      harlem: env.COLLECTION_HARLEM ?? '',
      morningside: env.COLLECTION_MORNINGSIDE ?? '',
    },
    metadataBaseUrl: (env.METADATA_BASE_URL || 'http://localhost:3000/metadata').replace(/\/+$/, ''),
    forceFail: env.SOLANA_FORCE_FAIL === 'true',
  };

  if (config.mode === 'real') {
    const missing = [
      !config.collections.harlem && 'COLLECTION_HARLEM',
      !config.collections.morningside && 'COLLECTION_MORNINGSIDE',
    ].filter(Boolean);
    if (missing.length > 0) {
      throw new SolanaConfigError(
        `SOLANA_MODE=real needs ${missing.join(' and ')}. Run npm run solana:setup and copy the printed values into .env.`
      );
    }
  }

  return config;
}
