/**Real stamp service: soulbound Metaplex Core stamps on Solana devnet.

Each stamp is minted straight into the user's wallet inside its
neighborhood collection, with a PermanentFreezeDelegate plugin that has no
authority, so nobody can ever unfreeze or transfer it. Place, neighborhood,
decision ID, XRPL hash, serial, and rarity tier are stored on chain in an
Attributes plugin, so reads do not depend on the metadata server.

Serials count stamps per place in the order they are found. They are worked
out from chain inside the mint queue, so anyone can recount them.
*/

import { PublicKey, Umi, generateSigner, publicKey } from '@metaplex-foundation/umi';
import { base58 } from '@metaplex-foundation/umi/serializers';
import {
  AssetV1,
  Key,
  create,
  fetchAssetsByCollection,
  getAssetV1GpaBuilder,
} from '@metaplex-foundation/mpl-core';
import { getSolanaClient } from './client';
import { SolanaConfig, loadSolanaConfig } from './config';
import { mintQueue, withOneRetry } from './mintQueue';
import { StampPlace, collectionForPlace, findPlace } from './places';
import { STAMP_SUPPLY_PER_PLACE, tierForSerial } from './rarity';
import { MintStampInput, MintStampResult, Stamp, StampService } from './types';

const MAX_NAME_LENGTH = 32;

/** Highest serial this process has minted per place. Covers an RPC read that
lags behind a mint that just confirmed. */
const lastSerialByPlace = new Map<string, number>();

/** Turn any thrown value into a readable message.

Args:
    error (unknown): The thrown value.

Returns:
    string: A plain-language message.
*/
function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Parse a base58 Solana address.

Args:
    address (string): Address to parse.
    label (string): What the address is, used in the error message.

Returns:
    PublicKey: The parsed address.

Raises:
    Error: If the address is not a valid Solana public key.
*/
function parseAddress(address: string, label: string): PublicKey {
  try {
    return publicKey(address);
  } catch {
    throw new Error(`invalid ${label}: '${address}'`);
  }
}

/** Send one create transaction and wait for confirmation.

Args:
    umi (Umi): Client with the issuer as identity and payer.
    builder (ReturnType<typeof create>): The create transaction to send.
    onSent ((signature: string) => void): Called with the signature as soon as
        it is sent, so a retry can still report it after a confirm timeout.

Raises:
    Error: If sending fails or the transaction fails on chain.
*/
async function sendAndConfirm(
  umi: Umi,
  builder: ReturnType<typeof create>,
  onSent: (signature: string) => void
): Promise<void> {
  const blockhash = await umi.rpc.getLatestBlockhash();
  const signature = await builder.setBlockhash(blockhash).send(umi);
  onSent(base58.deserialize(signature)[0]);
  const confirmation = await umi.rpc.confirmTransaction(signature, {
    strategy: { type: 'blockhash', ...blockhash },
    commitment: 'confirmed',
  });
  if (confirmation.value.err) {
    throw new Error(`mint transaction failed on chain: ${JSON.stringify(confirmation.value.err)}`);
  }
}

/** Count the stamps already minted for a place, straight from chain.

Args:
    umi (Umi): Solana client.
    collection (PublicKey): The place's neighborhood collection.
    placeId (string): Place to count.

Returns:
    Promise<number>: Stamps in the collection whose placeId attribute matches.
*/
async function countStampsForPlace(umi: Umi, collection: PublicKey, placeId: string): Promise<number> {
  const assets = await fetchAssetsByCollection(umi, collection, { skipDerivePlugins: true });
  return assets.filter((asset) =>
    (asset.attributes?.attributeList ?? []).some(
      (attribute) => attribute.key === 'placeId' && attribute.value === placeId
    )
  ).length;
}

/** Work out the serial for the next stamp at a place.

Must run inside the mint queue, so no other mint can take the same serial.

Args:
    umi (Umi): Solana client.
    collection (PublicKey): The place's neighborhood collection.
    placeId (string): Place being stamped.

Returns:
    Promise<number>: One more than the stamps already found for the place.

Raises:
    Error: If the RPC read fails twice.
*/
async function nextSerial(umi: Umi, collection: PublicKey, placeId: string): Promise<number> {
  const onChain = await withOneRetry(() => countStampsForPlace(umi, collection, placeId));
  return Math.max(onChain, lastSerialByPlace.get(placeId) ?? 0) + 1;
}

/** Build a stamp name like "Apollo Theater #37" that fits the on-chain limit.

Args:
    placeName (string): The place's display name.
    serial (number): The stamp's serial.

Returns:
    string: The name, with the place name shortened if needed.
*/
export function stampName(placeName: string, serial: number): string {
  const suffix = ` #${serial}`;
  return `${placeName.slice(0, MAX_NAME_LENGTH - suffix.length).trimEnd()}${suffix}`;
}

/** Mint a stamp for a place that has already been looked up.

Runs inside the shared mint queue and retries once. The retry reuses the
same asset address and serial, and first checks whether the first attempt
actually landed, so a slow confirmation never mints a second stamp.

Args:
    input (MintStampInput): Decision, place, wallet, and XRPL hash.
    place (StampPlace): The place being stamped.

Returns:
    Promise<MintStampResult>: Asset address, signature, serial, and tier, or
        an error message.
*/
export function mintStampForPlace(input: MintStampInput, place: StampPlace): Promise<MintStampResult> {
  return mintQueue.run(async () => {
    try {
      const config = loadSolanaConfig();
      const umi = getSolanaClient();
      const owner = parseAddress(input.userSolanaAddress, 'Solana address');
      const collection = parseAddress(collectionForPlace(config, place), 'collection address');
      const serial = await nextSerial(umi, collection, place.id);
      const tier = tierForSerial(serial);
      const asset = generateSigner(umi);
      let signature = '';

      await withOneRetry(async (attempt) => {
        if (attempt > 1 && (await umi.rpc.accountExists(asset.publicKey))) {
          return;
        }
        if (config.forceFail) {
          throw new Error('forced mint failure (SOLANA_FORCE_FAIL=true)');
        }
        const builder = create(umi, {
          asset,
          collection: { publicKey: collection },
          owner,
          name: stampName(place.name, serial),
          uri: `${config.metadataBaseUrl}/${input.decisionId}`,
          plugins: [
            { type: 'PermanentFreezeDelegate', frozen: true, authority: { type: 'None' } },
            { type: 'Edition', number: serial },
            {
              type: 'Attributes',
              attributeList: [
                { key: 'placeId', value: place.id },
                { key: 'neighborhood', value: place.neighborhood },
                { key: 'decisionId', value: input.decisionId },
                { key: 'xrplTxHash', value: input.xrplTxHash },
                { key: 'serial', value: String(serial) },
                { key: 'tier', value: tier },
                { key: 'supply', value: String(STAMP_SUPPLY_PER_PLACE) },
              ],
            },
          ],
        });
        await sendAndConfirm(umi, builder, (sent) => {
          signature = sent;
        });
      });

      lastSerialByPlace.set(place.id, serial);
      return { ok: true, assetAddress: asset.publicKey, signature, serial, tier };
    } catch (error) {
      return { ok: false, error: `stamp mint failed: ${describeError(error)}` };
    }
  });
}

/** Parse a serial attribute read from chain.

Args:
    value (string | undefined): The attribute value, if present.

Returns:
    number | null: The serial, or null if missing or not a positive whole number.
*/
function parseSerial(value: string | undefined): number | null {
  const serial = Number(value);
  return value && Number.isInteger(serial) && serial > 0 ? serial : null;
}

/** Convert an on-chain asset into a Stamp.

Args:
    asset (AssetV1): Asset fetched from chain.

Returns:
    Stamp: The stamp fields, with empty strings for missing attributes and
        null serial and tier for stamps minted before rarity existed.
*/
function toStamp(asset: AssetV1): Stamp {
  const attributes = new Map(
    (asset.attributes?.attributeList ?? []).map((attribute) => [attribute.key, attribute.value])
  );
  const serial = parseSerial(attributes.get('serial'));
  return {
    assetAddress: asset.publicKey,
    owner: asset.owner,
    collection: asset.updateAuthority.address ?? '',
    name: asset.name,
    uri: asset.uri,
    placeId: attributes.get('placeId') ?? '',
    neighborhood: attributes.get('neighborhood') ?? '',
    decisionId: attributes.get('decisionId') ?? '',
    xrplTxHash: attributes.get('xrplTxHash') ?? '',
    serial,
    tier: serial === null ? null : tierForSerial(serial),
  };
}

/** Read every WebPass stamp a wallet holds, straight from chain.

Only assets in the two neighborhood collections count, so unrelated
Core assets in the same wallet are ignored.

Args:
    config (SolanaConfig): Config with the collection addresses.
    umi (Umi): Solana client.
    owner (PublicKey): Wallet to read.

Returns:
    Promise<Stamp[]>: The wallet's stamps.
*/
async function fetchStamps(config: SolanaConfig, umi: Umi, owner: PublicKey): Promise<Stamp[]> {
  const ourCollections = new Set([config.collections.harlem, config.collections.morningside]);
  const assets = await getAssetV1GpaBuilder(umi)
    .whereField('key', Key.AssetV1)
    .whereField('owner', owner)
    .getDeserialized();
  return assets
    .filter((asset) => asset.updateAuthority.type === 'Collection')
    .filter((asset) => ourCollections.has(asset.updateAuthority.address ?? ''))
    .map(toStamp);
}

/** Stamp service backed by Solana devnet. */
export class RealStampService implements StampService {
  /** Look up the place and mint a frozen stamp into the user's wallet.

  Args:
      input (MintStampInput): Decision, place, wallet, and XRPL hash.

  Returns:
      Promise<MintStampResult>: Asset address and signature, or an error message.
  */
  async mintStamp(input: MintStampInput): Promise<MintStampResult> {
    const place = findPlace(input.placeId);
    if (!place) {
      return { ok: false, error: `stamp mint failed: unknown place '${input.placeId}'` };
    }
    return mintStampForPlace(input, place);
  }

  /** Check on chain whether a wallet already holds a stamp for a place.

  Args:
      solanaAddress (string): Wallet to check.
      placeId (string): Place to look for.

  Returns:
      Promise<boolean>: True if the wallet already has a stamp for the place.
          False for a malformed address.

  Raises:
      Error: If the RPC fails twice.
  */
  async hasStampForPlace(solanaAddress: string, placeId: string): Promise<boolean> {
    const stamps = await this.getStamps(solanaAddress);
    return stamps.some((stamp) => stamp.placeId === placeId);
  }

  /** Read a wallet's stamps from chain, with one retry.

  Args:
      solanaAddress (string): Wallet to read.

  Returns:
      Promise<Stamp[]>: The wallet's stamps, empty if none or if the
          address is malformed.

  Raises:
      Error: If the RPC fails twice.
  */
  async getStamps(solanaAddress: string): Promise<Stamp[]> {
    const config = loadSolanaConfig();
    let owner: PublicKey;
    try {
      owner = parseAddress(solanaAddress, 'Solana address');
    } catch {
      return [];
    }
    return withOneRetry(() => fetchStamps(config, getSolanaClient(), owner));
  }
}

/** Shared real service used when SOLANA_MODE=real. */
export const realStampService = new RealStampService();
