/**Place lookup for stamp minting.

Reads the shared places JSON file (owned by Arundathi) and picks the
neighborhood collection for each place. The file may be a plain array of
places or an object with a `places` array.
*/

import { existsSync, readFileSync } from 'fs';
import { SolanaConfig } from './config';

/** The place fields a stamp needs.

Attributes:
    id (string): Place ID, matched against MintStampInput.placeId.
    name (string): Display name, used as the stamp name.
    neighborhood (string): 'Harlem' or 'Morningside Heights'.
    imageUrl (string): Image link, served through the metadata page.
    solanaCollectionAddress (string | null, optional): Collection address. If
        missing, the collection is picked from config by neighborhood.
*/
export interface StampPlace {
  id: string;
  name: string;
  neighborhood: string;
  imageUrl: string;
  solanaCollectionAddress?: string | null;
}

/** Find a place by ID in the shared places file.

Args:
    config (SolanaConfig): Resolved config, used for the file path.
    placeId (string): Place to look up.

Returns:
    StampPlace | undefined: The place, or undefined if the file or place is missing.
*/
export function findPlace(config: SolanaConfig, placeId: string): StampPlace | undefined {
  if (!existsSync(config.placesPath)) {
    return undefined;
  }
  const parsed = JSON.parse(readFileSync(config.placesPath, 'utf8'));
  const places: StampPlace[] = Array.isArray(parsed) ? parsed : parsed.places ?? [];
  return places.find((place) => place.id === placeId);
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
