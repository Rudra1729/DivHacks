/**Try to transfer a stamp from demo user 1 to the attacker, and expect it to fail.

Run with `npm run solana:transfer-test`. Uses demo-1's newest stamp, or
mints one first if demo-1 has none. Demo-1 signs as the owner and the
issuer pays the fee, so demo-1 does not need SOL. Passes only if the
transfer is rejected and demo-1 still owns the stamp.
*/

import 'dotenv/config';
import { createSignerFromKeypair } from '@metaplex-foundation/umi';
import { fetchAsset, fetchCollection, transfer } from '@metaplex-foundation/mpl-core';
import { getSolanaClient, loadKeypairFile } from '../../src/solana/client';
import { loadSolanaConfig } from '../../src/solana/config';
import { mintStampForPlace, realStampService } from '../../src/solana/stamps';
import { ATTACKER_WALLET, DEMO_PLACE, explorerAddressUrl, keypairPath } from './common';

/** Find or mint demo-1's stamp, attempt the transfer, and verify it failed.

Returns:
    Promise<void>: Resolves when the check is done. Sets exit code 1 on failure.
*/
async function main(): Promise<void> {
  loadSolanaConfig({ ...process.env, SOLANA_MODE: 'real' });
  const umi = getSolanaClient();
  const demoSigner = createSignerFromKeypair(umi, loadKeypairFile(umi, keypairPath('demo-1')));
  const attacker = loadKeypairFile(umi, keypairPath(ATTACKER_WALLET)).publicKey;

  let assetAddress = (await realStampService.getStamps(demoSigner.publicKey)).slice(-1)[0]?.assetAddress;
  if (!assetAddress) {
    console.log('demo-1 has no stamp yet, minting one...');
    const minted = await mintStampForPlace(
      {
        decisionId: `transfer-test-${Date.now()}`,
        placeId: DEMO_PLACE.id,
        userSolanaAddress: demoSigner.publicKey,
        xrplTxHash: 'TRANSFER_TEST_XRPL_HASH',
      },
      DEMO_PLACE
    );
    if (!minted.ok) {
      console.error(`FAIL: could not mint a stamp to test with: ${minted.error}`);
      process.exitCode = 1;
      return;
    }
    assetAddress = minted.assetAddress;
  }

  const asset = await fetchAsset(umi, assetAddress);
  const collection =
    asset.updateAuthority.type === 'Collection' && asset.updateAuthority.address
      ? await fetchCollection(umi, asset.updateAuthority.address)
      : undefined;

  console.log(`Trying to transfer ${assetAddress} from demo-1 to attacker ${attacker}...`);
  let rejection = '';
  try {
    await transfer(umi, { asset, collection, newOwner: attacker, authority: demoSigner }).sendAndConfirm(umi);
  } catch (error) {
    rejection = (error as Error).message;
  }

  const ownerAfter = (await fetchAsset(umi, assetAddress)).owner;
  const blocked = rejection !== '' && ownerAfter === demoSigner.publicKey;
  console.log(blocked ? `PASS: transfer rejected (${rejection.split('\n')[0]})` : 'FAIL: transfer was not rejected');
  console.log(`Owner after attempt: ${ownerAfter}`);
  console.log(`Asset on explorer: ${explorerAddressUrl(assetAddress)}`);
  if (!blocked) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
