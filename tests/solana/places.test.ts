/**Tests that stamp place lookup uses the shared places module.*/

import { PLACES } from '../../src/data/places';
import { loadSolanaConfig } from '../../src/solana/config';
import { collectionForPlace, findPlace } from '../../src/solana/places';

const config = loadSolanaConfig({
  SOLANA_MODE: 'real',
  COLLECTION_HARLEM: 'HarlemCollection',
  COLLECTION_MORNINGSIDE: 'MorningsideCollection',
});

describe('stamp place lookup', () => {
  it('finds every place submission validation accepts', () => {
    for (const place of PLACES) {
      expect(findPlace(place.id)).toMatchObject({ id: place.id, name: place.name });
    }
  });

  it('returns undefined for an unknown place', () => {
    expect(findPlace('not-a-place')).toBeUndefined();
  });

  it('maps every place to one of the two neighborhood collections', () => {
    for (const place of PLACES) {
      expect(['HarlemCollection', 'MorningsideCollection']).toContain(collectionForPlace(config, place));
    }
  });

  it('prefers a collection address set on the place itself', () => {
    const place = { ...PLACES[0], solanaCollectionAddress: 'PlaceOwnCollection' };
    expect(collectionForPlace(config, place)).toBe('PlaceOwnCollection');
  });
});
