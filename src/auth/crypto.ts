/**Encryption for wallet secrets at rest.

Every user's Solana keypair and XRPL seed are custodial: the server holds
them, so they must never be stored in plaintext. This module is the only
place that reads WALLET_ENCRYPTION_KEY and the only place that encrypts or
decrypts a wallet secret.
*/

import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from 'crypto';

/** Raised when WALLET_ENCRYPTION_KEY is missing or invalid. */
export class WalletCryptoError extends Error {}

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const SALT = 'webpass-nyc-wallet-secret';

/** Derive a 32-byte AES key from WALLET_ENCRYPTION_KEY.

Args:
    env (NodeJS.ProcessEnv): Environment to read. Defaults to process.env.

Returns:
    Buffer: A 32-byte key, stable for a given WALLET_ENCRYPTION_KEY.

Raises:
    WalletCryptoError: If WALLET_ENCRYPTION_KEY is missing.
*/
function loadKey(env: NodeJS.ProcessEnv = process.env): Buffer {
  const passphrase = env.WALLET_ENCRYPTION_KEY;
  if (!passphrase) {
    throw new WalletCryptoError(
      'WALLET_ENCRYPTION_KEY is missing. Custodial wallet secrets cannot be stored without it.'
    );
  }
  return scryptSync(passphrase, SALT, 32);
}

/** Encrypt a wallet secret for storage.

Args:
    plaintext (string): The secret to encrypt (an XRPL seed, or a Solana
        keypair's JSON-encoded byte array).
    env (NodeJS.ProcessEnv): Environment to read the key from.

Returns:
    string: `iv:authTag:ciphertext`, each hex-encoded.
*/
export function encryptSecret(plaintext: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = loadKey(env);
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((buf) => buf.toString('hex')).join(':');
}

/** Decrypt a wallet secret read from storage.

Args:
    encoded (string): Value produced by encryptSecret.
    env (NodeJS.ProcessEnv): Environment to read the key from.

Returns:
    string: The original plaintext secret.

Raises:
    WalletCryptoError: If the encoded value is malformed or fails
        authentication (wrong key, or tampered ciphertext).
*/
export function decryptSecret(encoded: string, env: NodeJS.ProcessEnv = process.env): string {
  const key = loadKey(env);
  const parts = encoded.split(':');
  if (parts.length !== 3) {
    throw new WalletCryptoError('Encrypted wallet secret is malformed.');
  }
  const [ivHex, authTagHex, ciphertextHex] = parts;
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const plaintext = Buffer.concat([decipher.update(Buffer.from(ciphertextHex, 'hex')), decipher.final()]);
    return plaintext.toString('utf8');
  } catch {
    throw new WalletCryptoError('Could not decrypt wallet secret: wrong key or corrupted data.');
  }
}
