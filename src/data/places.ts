/**The shared list of eligible places, per the PRD's "Places data" section.

Coordinates were checked against OpenStreetMap and Wikidata (Malcolm Shabazz
Harlem Market against OpenStreetMap only) but not yet on site. Image links are
placeholders until real photos exist. Solana collection addresses stay null
until collections are set up. This module
is the single source of truth other modules should import from, so
updating it updates the whole backend.

PLACES itself never changes at runtime. Places added later by the weekly
mission scout (src/missions) live in a separate generated file and are
merged in only by getAllPlaces() and getPlaceById(), so anything reading
PLACES directly keeps seeing exactly this fixed list.
*/

import { readGeneratedMissions } from '../missions/store';

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
  /** One-line description shown to visitors. Optional: the fixed places below do not set it. */
  description?: string;
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
];

/** Places added since launch by the weekly mission scout (src/missions).

Read fresh on every call: the file is tiny and this keeps a freshly
generated mission visible immediately, with no cache to invalidate.

Returns:
    Place[]: Generated places, [] if none have been added yet.
*/
export function getGeneratedPlaces(): Place[] {
  return readGeneratedMissions();
}

/** Every place a user can currently complete a mission at: the fixed list plus
anything the weekly mission scout has generated since.

Returns:
    Place[]: PLACES followed by any generated places, fixed places first.
*/
export function getAllPlaces(): Place[] {
  return [...PLACES, ...getGeneratedPlaces()];
}

/** Look up a place by ID, fixed or generated.

Args:
    placeId (string): The place's ID.

Returns:
    Place | undefined: The place, or undefined if the ID is unknown.
*/
export function getPlaceById(placeId: string): Place | undefined {
  return getAllPlaces().find((place) => place.id === placeId);
}
