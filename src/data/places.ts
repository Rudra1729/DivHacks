/**The shared list of eligible places, per the PRD's "Places data" section.

Coordinates were checked against OpenStreetMap and Wikidata (Malcolm Shabazz
Harlem Market against OpenStreetMap only) but not yet on site. Image links are
placeholders until real photos exist. Solana collection addresses stay null
until collections are set up. This module
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
    imageUrl: 'https://placehold.co/600x600/png?text=apollo+theater',
  },
  {
    id: 'studio-museum-harlem',
    name: 'Studio Museum in Harlem',
    neighborhood: 'Harlem',
    latitude: 40.80835,
    longitude: -73.94766,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://placehold.co/600x600/png?text=studio+museum+harlem',
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
    imageUrl: 'https://placehold.co/600x600/png?text=marcus+garvey+park',
  },
  {
    id: 'hamilton-grange',
    name: 'Hamilton Grange National Memorial',
    neighborhood: 'Harlem',
    latitude: 40.82138,
    longitude: -73.94726,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://placehold.co/600x600/png?text=hamilton+grange',
  },
  {
    id: 'malcolm-shabazz-market',
    name: 'Malcolm Shabazz Harlem Market',
    neighborhood: 'Harlem',
    latitude: 40.80147,
    longitude: -73.94886,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://placehold.co/600x600/png?text=malcolm+shabazz+market',
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
    imageUrl: 'https://placehold.co/600x600/png?text=morningside+park',
  },
  {
    id: 'mudd-building',
    name: 'Seeley W. Mudd Building',
    neighborhood: 'Morningside Heights',
    latitude: 40.81005,
    longitude: -73.96030,
    geofenceRadiusMeters: 200,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://placehold.co/600x600/png?text=mudd+building',
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
