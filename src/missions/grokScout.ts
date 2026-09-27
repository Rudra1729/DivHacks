/**Grok mission scout.

Asks Grok to propose new, overlooked New York City places for WebPass NYC to
reward visits to. "Overlooked" is a rule we hand Grok, not something it
discovers on its own: not a major tourist draw, and not a rephrasing of a
place we already reward. Grok has no live view of the web by default, so
this reads from its training knowledge, not real-time trends.

Grok's answer is untrusted input, the same way the payout agent treats it:
every candidate is checked for shape, checked against the NYC bounding box,
and checked for distance from every existing place before it is used. A
missing API key, a bad reply, or a network error all fall back to a small
built-in list of real, lesser-known NYC spots, filtered the same way, so
this never throws and a weekly refresh never comes back empty-handed.
*/

import { Place } from '../data/places';
import { distanceMeters, isWithinNyc, MIN_DISTANCE_FROM_EXISTING_METERS } from './nyc';
import { MissionCandidate, MissionScout, MissionScoutInput } from './types';

export interface GrokMissionScoutOptions {
  /** API key. Without one the scout always uses the fallback pool. */
  apiKey?: string;
  model: string;
  endpoint: string;
  timeoutMs?: number;
  /** Injectable for tests. Defaults to the global fetch. */
  fetchFn?: typeof fetch;
  /** Default RLUSD reward for a candidate that does not suggest its own. Kept at or below the per-task cap. */
  defaultRewardRlusd?: number;
}

const DEFAULT_TIMEOUT_MS = 20000;
const MAX_REWARD_RLUSD = 5; // matches src/policy/rules.ts MAX_PER_TASK
const MIN_REWARD_RLUSD = 0.5;

const SYSTEM_PROMPT =
  'You scout new missions for WebPass NYC, an app that pays small RLUSD rewards for visiting ' +
  'overlooked cultural sites, parks, and small businesses in New York City. "Overlooked" means: ' +
  'not a major tourist attraction, not already famous, the kind of place a local would know but a ' +
  'guidebook would not lead with. Every place must be a real, specific, publicly accessible location ' +
  'somewhere in the five boroughs of New York City, with a real approximate latitude and longitude. ' +
  'Respond with only a JSON array, no prose, of objects shaped exactly like: ' +
  '{"name": string, "neighborhood": string, "latitude": number, "longitude": number, ' +
  '"reason": string (why it counts as overlooked), "description": string (one sentence, shown to visitors), ' +
  '"baseRewardRlusd": number (between 0.5 and 5)}.';

/** A small pool of real, lesser-known NYC spots, used when Grok is unavailable.

Deliberately spread across boroughs so a weekly fallback run does not repeat
itself for a long time; each is filtered against existing places like any
other candidate, so a duplicate is dropped rather than reused.
*/
const FALLBACK_POOL: MissionCandidate[] = [
  {
    name: 'City Reliquary',
    neighborhood: 'Williamsburg, Brooklyn',
    latitude: 40.7143,
    longitude: -73.9506,
    reason: 'A small, volunteer-run museum of NYC ephemera that most visitors never hear about.',
    description: 'A tiny museum of NYC curiosities and everyday history, tucked into a Williamsburg storefront.',
    baseRewardRlusd: 1,
  },
  {
    name: 'Louis Armstrong House Museum',
    neighborhood: 'Corona, Queens',
    latitude: 40.7527,
    longitude: -73.8630,
    reason: 'A historic home in a residential Queens neighborhood, well outside the usual tourist path.',
    description: "Louis Armstrong's home for 28 years, preserved as he left it, in a quiet Corona block.",
    baseRewardRlusd: 1.5,
  },
  {
    name: 'Wave Hill',
    neighborhood: 'Riverdale, The Bronx',
    latitude: 40.8994,
    longitude: -73.9128,
    reason: 'A public garden overlooking the Hudson that rarely makes NYC visitor lists.',
    description: 'A public garden and cultural center with sweeping Hudson River views in the north Bronx.',
    baseRewardRlusd: 1,
  },
  {
    name: 'Alice Austen House',
    neighborhood: 'Rosebank, Staten Island',
    latitude: 40.6035,
    longitude: -74.0679,
    reason: 'A waterfront historic house museum on Staten Island, far from the usual Manhattan-centric routes.',
    description: 'A 17th-century harborside cottage and museum honoring pioneering photographer Alice Austen.',
    baseRewardRlusd: 1.5,
  },
  {
    name: 'City Island Nautical Museum',
    neighborhood: 'City Island, The Bronx',
    latitude: 40.8468,
    longitude: -73.7876,
    reason: 'A small maritime museum on a little-visited island neighborhood in the Bronx.',
    description: 'A community-run museum on a small nautical island neighborhood, a world away from midtown.',
    baseRewardRlusd: 1,
  },
];

/** Turn Grok's reply text into candidates, or undefined if it is not a well-formed JSON array.

Args:
    text (string): Raw message content from Grok.

Returns:
    MissionCandidate[] | undefined: Parsed candidates, unfiltered, or undefined
        if the text is not a JSON array of well-shaped objects.
*/
export function parseCandidates(text: string): MissionCandidate[] | undefined {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    return undefined;
  }
  if (!Array.isArray(value)) {
    return undefined;
  }

  const candidates: MissionCandidate[] = [];
  for (const item of value) {
    if (typeof item !== 'object' || item === null) continue;
    const { name, neighborhood, latitude, longitude, reason, description, baseRewardRlusd } =
      item as Record<string, unknown>;
    if (typeof name !== 'string' || name.trim().length === 0) continue;
    if (typeof neighborhood !== 'string' || neighborhood.trim().length === 0) continue;
    if (typeof latitude !== 'number' || !Number.isFinite(latitude)) continue;
    if (typeof longitude !== 'number' || !Number.isFinite(longitude)) continue;
    if (typeof description !== 'string' || description.trim().length === 0) continue;
    candidates.push({
      name: name.trim(),
      neighborhood: neighborhood.trim(),
      latitude,
      longitude,
      reason: typeof reason === 'string' ? reason.trim() : '',
      description: description.trim(),
      baseRewardRlusd: typeof baseRewardRlusd === 'number' && Number.isFinite(baseRewardRlusd) ? baseRewardRlusd : NaN,
    });
  }
  return candidates;
}

/** Clamp a proposed reward into the policy's allowed range, rounded to cents.

Args:
    amount (number): Proposed reward. NaN or out-of-range falls back to `fallback`.
    fallback (number): Value to use when `amount` is not usable.

Returns:
    number: A reward between MIN_REWARD_RLUSD and MAX_REWARD_RLUSD.
*/
function clampReward(amount: number, fallback: number): number {
  const value = Number.isFinite(amount) ? amount : fallback;
  const bounded = Math.min(MAX_REWARD_RLUSD, Math.max(MIN_REWARD_RLUSD, value));
  return Math.round(bounded * 100) / 100;
}

/** Keep only candidates that are real NYC locations and not near an existing place.

Args:
    candidates (MissionCandidate[]): Unfiltered candidates.
    existingPlaces (Place[]): Places already live, fixed or previously generated.
    defaultReward (number): Reward to use when a candidate's own suggestion is unusable.

Returns:
    MissionCandidate[]: Candidates within NYC bounds, far enough from every
        existing place, and with a reward inside the policy's range.
*/
export function filterCandidates(
  candidates: MissionCandidate[],
  existingPlaces: Place[],
  defaultReward: number
): MissionCandidate[] {
  return candidates
    .filter((candidate) => isWithinNyc(candidate.latitude, candidate.longitude))
    .filter((candidate) =>
      existingPlaces.every(
        (place) =>
          distanceMeters(candidate, { latitude: place.latitude, longitude: place.longitude }) >=
          MIN_DISTANCE_FROM_EXISTING_METERS
      )
    )
    .map((candidate) => ({ ...candidate, baseRewardRlusd: clampReward(candidate.baseRewardRlusd, defaultReward) }));
}

export class GrokMissionScout implements MissionScout {
  constructor(private options: GrokMissionScoutOptions) {}

  /** Propose new missions, validated and filtered. Never throws.

  Args:
      input (MissionScoutInput): Existing places to avoid duplicating, and how many to propose.

  Returns:
      Promise<MissionCandidate[]>: Up to `input.count` validated candidates.
          Falls back to the built-in pool if Grok is unavailable, its reply
          cannot be parsed, or every proposed candidate is filtered out.
  */
  async scout(input: MissionScoutInput): Promise<MissionCandidate[]> {
    const defaultReward = this.options.defaultRewardRlusd ?? 1;
    const fromGrok = this.options.apiKey ? await this.askGrok(input) : undefined;
    const filtered = fromGrok ? filterCandidates(fromGrok, input.existingPlaces, defaultReward) : [];
    if (filtered.length > 0) {
      return filtered.slice(0, input.count);
    }
    const fallback = filterCandidates(FALLBACK_POOL, input.existingPlaces, defaultReward);
    return fallback.slice(0, input.count);
  }

  /** Call the Grok API for candidates. Returns undefined on any failure, never throws.

  Args:
      input (MissionScoutInput): Existing places and how many candidates to ask for.

  Returns:
      Promise<MissionCandidate[] | undefined>: Parsed (unfiltered) candidates, or undefined.
  */
  private async askGrok(input: MissionScoutInput): Promise<MissionCandidate[] | undefined> {
    const fetchFn = this.options.fetchFn ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    try {
      const knownList = input.existingPlaces
        .map((place) => `- ${place.name} (${place.neighborhood}, ${place.latitude}, ${place.longitude})`)
        .join('\n');
      const userPrompt =
        `Propose ${input.count} new overlooked NYC mission(s). Do not repeat, rename, or sit within ` +
        `${MIN_DISTANCE_FROM_EXISTING_METERS} meters of any of these already-rewarded places:\n${knownList}`;

      const response = await fetchFn(this.options.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.options.apiKey}` },
        body: JSON.stringify({
          model: this.options.model,
          temperature: 0.7,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) return undefined;

      const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
      const content = body.choices?.[0]?.message?.content;
      return typeof content === 'string' ? parseCandidates(content) : undefined;
    } catch {
      return undefined;
    } finally {
      clearTimeout(timer);
    }
  }
}
