import { isValidClassicAddress, Wallet } from 'xrpl';
import { decryptSecret } from '../../src/auth/crypto';
import { provisionWallets } from '../../src/auth/provisionWallet';

const env = { WALLET_ENCRYPTION_KEY: 'test-passphrase-do-not-use-in-prod' };

describe('provisionWallets', () => {
  it('generates a valid XRPL address whose decrypted seed reproduces it', () => {
    const wallets = provisionWallets(env);
    expect(isValidClassicAddress(wallets.xrplAddress)).toBe(true);

    const seed = decryptSecret(wallets.xrplSecretEncrypted, env);
    expect(Wallet.fromSeed(seed).classicAddress).toBe(wallets.xrplAddress);
  });

  it('generates a Solana address whose decrypted secret key reproduces it', () => {
    const wallets = provisionWallets(env);
    expect(wallets.solanaAddress).toMatch(/^[1-9A-HJ-NP-Za-km-z]{32,44}$/);

    const secretKeyJson = decryptSecret(wallets.solanaSecretEncrypted, env);
    const secretKey = JSON.parse(secretKeyJson);
    expect(Array.isArray(secretKey)).toBe(true);
    expect(secretKey).toHaveLength(64);
  });

  it('generates a different pair of wallets each call', () => {
    const first = provisionWallets(env);
    const second = provisionWallets(env);
    expect(first.xrplAddress).not.toBe(second.xrplAddress);
    expect(first.solanaAddress).not.toBe(second.solanaAddress);
  });
});
