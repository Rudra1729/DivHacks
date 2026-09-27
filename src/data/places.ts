/**The shared list of eligible places, per the PRD's "Places data" section.

Coordinates were checked against OpenStreetMap and Wikidata (Malcolm Shabazz
Harlem Market against OpenStreetMap only) but not yet on site. Image links are
placeholders until real photos exist. Solana collection addresses stay null
until collections are set up. Sponsors are the local organizations shown as
funding each civic bounty. This module
is the single source of truth other modules should import from, so
updating it updates the whole backend.
*/

/** Cultural visits earn only a stamp. Civic bounties also pay RLUSD. */
export type PlaceKind = 'cultural' | 'civic';

export interface Place {
  id: string;
  name: string;
  kind: PlaceKind;
  neighborhood: string;
  latitude: number;
  longitude: number;
  geofenceRadiusMeters: number;
  baseRewardRlusd: number;
  solanaCollectionAddress: string | null;
  imageUrl: string;
  /** Local organization funding the RLUSD bounty. Null for stamp-only places. */
  sponsor: string | null;
  /** What a photo taken here shows. Given to Grok's photo check. */
  photoHint: string;
}

export const PLACES: Place[] = [
  {
    id: 'apollo-theater',
    name: 'Apollo Theater',
    kind: 'cultural',
    neighborhood: 'Harlem',
    latitude: 40.8102,
    longitude: -73.9500,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://placehold.co/600x600/png?text=apollo+theater',
    sponsor: null,
    photoHint: 'The Apollo Theater on W 125th St: its red and white APOLLO sign and marquee, the facade, or the lobby.',
  },
  {
    id: 'studio-museum-harlem',
    name: 'Studio Museum in Harlem',
    kind: 'cultural',
    neighborhood: 'Harlem',
    latitude: 40.80835,
    longitude: -73.94766,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://placehold.co/600x600/png?text=studio+museum+harlem',
    sponsor: null,
    photoHint: 'The Studio Museum in Harlem at 144 W 125th St: its modern facade, entrance, signage, or galleries.',
  },
  {
    id: 'marcus-garvey-park',
    name: 'Marcus Garvey Park',
    kind: 'civic',
    neighborhood: 'Harlem',
    latitude: 40.8043,
    longitude: -73.9439,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://placehold.co/600x600/png?text=marcus+garvey+park',
    sponsor: 'Marcus Garvey Park Alliance',
    photoHint: 'Marcus Garvey Park in Harlem: a park entrance, path, wheelchair ramp, the fire watchtower, the amphitheater, lawns, or rocky outcrops.',
  },
  {
    id: 'hamilton-grange',
    name: 'Hamilton Grange National Memorial',
    kind: 'cultural',
    neighborhood: 'Harlem',
    latitude: 40.82138,
    longitude: -73.94726,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://placehold.co/600x600/png?text=hamilton+grange',
    sponsor: null,
    photoHint: "Hamilton Grange, Alexander Hamilton's yellow Federal-style house in St. Nicholas Park: the house, its porch, grounds, signage, or interior.",
  },
  {
    id: 'malcolm-shabazz-market',
    name: 'Malcolm Shabazz Harlem Market',
    kind: 'civic',
    neighborhood: 'Harlem',
    latitude: 40.80147,
    longitude: -73.94886,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://placehold.co/600x600/png?text=malcolm+shabazz+market',
    sponsor: 'Harlem Business Alliance',
    photoHint: 'Malcolm Shabazz Harlem Market on W 116th St: its colorful arched entrance, vendor stalls, goods, or a community fridge.',
  },
  {
    id: 'morningside-park',
    name: 'Morningside Park',
    kind: 'cultural',
    neighborhood: 'Morningside Heights',
    latitude: 40.8065,
    longitude: -73.9585,
    geofenceRadiusMeters: 150,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://placehold.co/600x600/png?text=morningside+park',
    sponsor: null,
    photoHint: 'Morningside Park: its cliffside stone stairs and paths, the pond and waterfall, trees and lawns, or park signage.',
  },
  {
    id: 'mudd-building',
    name: 'Seeley W. Mudd Building',
    kind: 'cultural',
    neighborhood: 'Morningside Heights',
    latitude: 40.81005,
    longitude: -73.96030,
    geofenceRadiusMeters: 200,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://placehold.co/600x600/png?text=mudd+building',
    sponsor: null,
    photoHint: 'The Seeley W. Mudd Building of Columbia Engineering, 500 W 120th St at Amsterdam Ave: its facade, signage, lobby, or halls.',
  },
  {
    id: 'mudd-entrance',
    name: 'Mudd Building Entrance',
    kind: 'civic',
    neighborhood: 'Morningside Heights',
    latitude: 40.8106,
    longitude: -73.9601,
    geofenceRadiusMeters: 200,
    baseRewardRlusd: 1,
    solanaCollectionAddress: null,
    imageUrl: 'https://placehold.co/600x600/png?text=mudd+entrance',
    sponsor: 'Columbia Engineering',
    photoHint: 'The entrance of the Mudd Building at Columbia Engineering on W 120th St: its doors, ramp, steps, or entrance signs.',
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
