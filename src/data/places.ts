/**The shared list of eligible places, per the PRD's "Places data" section.

Coordinates and Solana collection addresses here are placeholders for the
5:00 PM kickoff, where Arundathi finalizes the real 6 places. This module
is the single source of truth other modules should import from, so
updating it updates the whole backend.
*/

export interface Place {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  baseRewardRlusd: number;
  solanaCollectionAddress: string | null;
  imageUrl: string;
}

export const PLACES: Place[] = [
  {
    id: 'apollo-theater',
    name: 'Apollo Theater',
    neighborhood: 'Harlem',
    latitude: 40.8102,
    longitude: -73.9500,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://example.com/places/apollo-theater.jpg',
  },
  {
    id: 'studio-museum-harlem',
    name: 'Studio Museum in Harlem',
    neighborhood: 'Harlem',
    latitude: 40.8058,
    longitude: -73.9470,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://example.com/places/studio-museum-harlem.jpg',
  },
  {
    id: 'marcus-garvey-park',
    name: 'Marcus Garvey Park',
    neighborhood: 'Harlem',
    latitude: 40.8043,
    longitude: -73.9439,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://example.com/places/marcus-garvey-park.jpg',
  },
  {
    id: 'hamilton-grange',
    name: 'Hamilton Grange National Memorial',
    neighborhood: 'Harlem',
    latitude: 40.8236,
    longitude: -73.9490,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://example.com/places/hamilton-grange.jpg',
  },
  {
    id: 'malcolm-shabazz-market',
    name: 'Malcolm Shabazz Harlem Market',
    neighborhood: 'Harlem',
    latitude: 40.8072,
    longitude: -73.9483,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://example.com/places/malcolm-shabazz-market.jpg',
  },
  {
    id: 'morningside-park',
    name: 'Morningside Park',
    neighborhood: 'Morningside Heights',
    latitude: 40.8065,
    longitude: -73.9585,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://example.com/places/morningside-park.jpg',
  },
];

/** Look up a place by ID.

Args:
    placeId (string): The place's ID.

Returns:
    Place | undefined: The place, or undefined if the ID is unknown.
*/
export function getPlaceById(placeId: string): Place | undefined {
  return PLACES.find((place) => place.id === placeId);
}
