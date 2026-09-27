/**Types for the weekly mission scout.

The scout proposes new places for WebPass NYC to reward visits to. Its
output is untrusted the same way the payout agent's is: everything is
validated (shape, NYC bounds, distance from existing places) before a
candidate is allowed to become a real, payable place.
*/

import { Place } from '../data/places';

/** What the scout is told when looking for new missions. */
export interface MissionScoutInput {
  /** Every place already live (fixed and previously generated), so the scout avoids duplicates. */
  existingPlaces: Place[];
  /** How many new missions to propose this run. */
  count: number;
}

/** A new place proposed by the scout, validated but not yet assigned an ID. */
export interface MissionCandidate {
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  /** Why this counts as overlooked, shown nowhere yet but kept for review/debugging. */
  reason: string;
  description: string;
  baseRewardRlusd: number;
}

/** Anything that can propose new missions. */
export interface MissionScout {
  scout(input: MissionScoutInput): Promise<MissionCandidate[]>;
}
