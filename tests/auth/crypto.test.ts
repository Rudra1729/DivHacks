import { decryptSecret, encryptSecret, WalletCryptoError } from '../../src/auth/crypto';

const env = { WALLET_ENCRYPTION_KEY: 'test-passphrase-do-not-use-in-prod' };

describe('wallet secret encryption', () => {
  it('round-trips a secret through encrypt and decrypt', () => {
    const encrypted = encryptSecret('sEdSuperSecretSeed', env);
    expect(encrypted).not.toContain('sEdSuperSecretSeed');
    expect(decryptSecret(encrypted, env)).toBe('sEdSuperSecretSeed');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    const first = encryptSecret('same-plaintext', env);
    const second = encryptSecret('same-plaintext', env);
    expect(first).not.toBe(second);
  });

  it('throws if WALLET_ENCRYPTION_KEY is missing', () => {
    expect(() => encryptSecret('secret', {})).toThrow(WalletCryptoError);
  });

  it('throws if decrypting with the wrong key', () => {
    const encrypted = encryptSecret('secret', env);
    expect(() => decryptSecret(encrypted, { WALLET_ENCRYPTION_KEY: 'wrong-key' })).toThrow(WalletCryptoError);
  });

  it('throws on malformed encoded input', () => {
    expect(() => decryptSecret('not-valid', env)).toThrow(WalletCryptoError);
  });
});
