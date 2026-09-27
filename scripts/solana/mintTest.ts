/**Mint one real frozen stamp to demo user 1 and read it back.

Run with `npm run solana:mint-test` after `npm run solana:setup` and after
copying the collection addresses into .env. Checks the per-owner acceptance
criteria from the PRD: the stamp is frozen, and it reads back with the right
place and decision ID. Also checks the stamp's serial and rarity tier.

Usage:
    npm run solana:mint-test -- [placeId] [xrplTxHash]
*/

import 'dotenv/config';
import { fetchAsset } from '@metaplex-foundation/mpl-core';
import { getSolanaClient, loadKeypairFile } from '../../src/solana/client';
import { loadSolanaConfig } from '../../src/solana/config';
import { findPlace } from '../../src/solana/places';
import { mintStampForPlace, realStampService } from '../../src/solana/stamps';
import { DEMO_PLACE, explorerAddressUrl, explorerTxUrl, keypairPath } from './common';

/** Mint, read back, and verify one stamp. Sets exit code 1 on any failure.

Returns:
    Promise<void>: Resolves when the checks are done.
*/
async function main(): Promise<void> {
  loadSolanaConfig({ ...process.env, SOLANA_MODE: 'real' });
  const umi = getSolanaClient();
  const [placeArg, xrplArg] = process.argv.slice(2);
  const place = (placeArg && findPlace(placeArg)) || DEMO_PLACE;
  const demoUser = loadKeypairFile(umi, keypairPath('demo-1')).publicKey;
  const decisionId = `mint-test-${Date.now()}`;

  console.log(`Minting a stamp for ${place.name} (${place.id}) to demo-1 ${demoUser}...`);
  const result = await mintStampForPlace(
    { decisionId, placeId: place.id, userSolanaAddress: demoUser, xrplTxHash: xrplArg ?? 'MINT_TEST_XRPL_HASH' },
    place
  );
  if (!result.ok) {
    console.error(`FAIL: ${result.error}`);
    process.exitCode = 1;
    return;
  }
  console.log(`Minted ${result.assetAddress}: ${place.name} #${result.serial}, ${result.tier}`);
  console.log(`Transaction: ${explorerTxUrl(result.signature)}`);

  const asset = await fetchAsset(umi, result.assetAddress);
  const stamps = await realStampService.getStamps(demoUser);
  const stamp = stamps.find((candidate) => candidate.assetAddress === result.assetAddress);
  const hasStamp = await realStampService.hasStampForPlace(demoUser, place.id);

  const checks: Array<[string, boolean]> = [
    ['stamp is permanently frozen', asset.permanentFreezeDelegate?.frozen === true],
    ['freeze has no authority (nobody can unfreeze)', asset.permanentFreezeDelegate?.authority.type === 'None'],
    ['owner is demo-1', asset.owner === demoUser],
    ['read back with the right place', stamp?.placeId === place.id],
    ['read back with the right decision ID', stamp?.decisionId === decisionId],
    ['read back with the same serial and tier', stamp?.serial === result.serial && stamp?.tier === result.tier],
    ['edition number matches the serial', asset.edition?.number === result.serial],
    ['already-has-stamp check is true', hasStamp],
  ];
  for (const [label, passed] of checks) {
    console.log(`${passed ? 'PASS' : 'FAIL'}: ${label}`);
  }
  console.log(`\nAsset on explorer: ${explorerAddressUrl(result.assetAddress)}`);

  if (checks.some(([, passed]) => !passed)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
