/**Provisions a fresh custodial wallet pair for a new user.

Every user gets their own Solana keypair (their NFT stamps live here) and
their own XRPL wallet (their RLUSD balance lives here), generated once at
signup. Both secrets are encrypted before they ever reach the database;
this module is the only place a freshly generated secret exists in
plaintext, and only for the moment it takes to encrypt it.
*/

import { createUmi } from '@metaplex-foundation/umi-bundle-defaults';
import { Wallet } from 'xrpl';
import { encryptSecret } from './crypto';

export interface ProvisionedWallets {
  xrplAddress: string;
  xrplSecretEncrypted: string;
  solanaAddress: string;
  solanaSecretEncrypted: string;
}

/** Generate a new Solana keypair and XRPL wallet, and encrypt their secrets.

Args:
    env (NodeJS.ProcessEnv): Environment WALLET_ENCRYPTION_KEY is read from.

Returns:
    ProvisionedWallets: Public addresses, and secrets already encrypted
        for storage.
*/
export function provisionWallets(env: NodeJS.ProcessEnv = process.env): ProvisionedWallets {
  // A minimal Umi instance is enough to generate a keypair: it never talks
  // to the network for that, so this works offline and needs no RPC config.
  const umi = createUmi('https://api.devnet.solana.com');
  const solanaKeypair = umi.eddsa.generateKeypair();
  const xrplWallet = Wallet.generate();

  return {
    xrplAddress: xrplWallet.classicAddress,
    xrplSecretEncrypted: encryptSecret(xrplWallet.seed as string, env),
    solanaAddress: solanaKeypair.publicKey.toString(),
    solanaSecretEncrypted: encryptSecret(JSON.stringify(Array.from(solanaKeypair.secretKey)), env),
  };
}
