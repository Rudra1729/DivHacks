/**Place lookup for stamp minting.

Reads places from the shared places module (src/data/places.ts), the same
source submission validation and the metadata pages use, so every place a
submission can name can also be stamped. Also picks the neighborhood
collection for each place.
*/

import { getPlaceById } from '../data/places';
import { SolanaConfig } from './config';
import { StampTier } from './rarity';

/** The place fields a stamp needs.

Attributes:
    id (string): Place ID, matched against MintStampInput.placeId.
    name (string): Display name, used as the stamp name.
    neighborhood (string): 'Harlem' or 'Morningside Heights'.
    imageUrl (string): Image link, served through the metadata page.
    solanaCollectionAddress (string | null, optional): Collection address. If
        missing, the collection is picked from config by neighborhood.
    fixedTier (StampTier, optional): Tier every stamp here gets, whatever
        its serial.
*/
export interface StampPlace {
  id: string;
  name: string;
  neighborhood: string;
  imageUrl: string;
  solanaCollectionAddress?: string | null;
  fixedTier?: StampTier;
}

/** Find a place by ID in the shared places module.

Args:
    placeId (string): Place to look up.

Returns:
    StampPlace | undefined: The place, or undefined if the ID is unknown.
*/
export function findPlace(placeId: string): StampPlace | undefined {
  return getPlaceById(placeId);
}

/** Pick the collection address a place's stamp belongs to.

Args:
    config (SolanaConfig): Resolved config with the collection addresses.
    place (StampPlace): The place being stamped.

Returns:
    string: Collection address.

Raises:
    Error: If the place is not in a known neighborhood and has no collection.
*/
export function collectionForPlace(config: SolanaConfig, place: StampPlace): string {
  if (place.solanaCollectionAddress) {
    return place.solanaCollectionAddress;
  }
  const hood = place.neighborhood.toLowerCase();
  if (hood.includes('morningside')) {
    return config.collections.morningside;
  }
  if (hood.includes('harlem')) {
    return config.collections.harlem;
  }
  throw new Error(`No Solana collection for neighborhood '${place.neighborhood}' (place ${place.id})`);
}
