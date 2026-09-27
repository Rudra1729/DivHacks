/**Persistence for generated missions.

Generated missions are committed as plain JSON, the same way the fixed
places list is committed as TypeScript: they are real app data, not a
secret or a build artifact. Kept separate from src/data/places.ts so the
fixed, curated list is never touched by an automated process.
*/

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import type { Place } from '../data/places';
import { MissionCandidate } from './types';

/** Path to the generated missions file. Overridable so tests never touch the real file. */
export function generatedMissionsPath(env: NodeJS.ProcessEnv = process.env): string {
  return env.GENERATED_MISSIONS_PATH || join('data', 'generated-missions.json');
}

/** One generated mission as stored on disk, a Place plus when and why it was added. */
export interface GeneratedMissionRecord extends Place {
  generatedAt: string;
  reason: string;
}

/** Read every generated mission from disk.

Args:
    path (string): File to read. Defaults to generatedMissionsPath().

Never throws: a missing, empty, wrongly-encoded (for example UTF-16, which
some shells write by default, e.g. PowerShell's `>` redirection), or corrupt
file is treated as "no generated missions yet" rather than taking down
whatever called this, since it sits underneath GET /places and the policy
engine's allowlist check.

Returns:
    GeneratedMissionRecord[]: The stored missions, or [] if the file does
        not exist, is empty, or could not be read as a JSON array.
*/
export function readGeneratedMissions(path: string = generatedMissionsPath()): GeneratedMissionRecord[] {
  if (!existsSync(path)) {
    return [];
  }
  try {
    const raw = decodeFileText(readFileSync(path)).trim();
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as GeneratedMissionRecord[]) : [];
  } catch (error) {
    console.warn(`Could not read ${path}, treating it as empty: ${error instanceof Error ? error.message : String(error)}`);
    return [];
  }
}

/** Decode a file's bytes to text, handling UTF-16 (with or without a BOM) and
a UTF-8 BOM, since appendGeneratedMissions always writes plain UTF-8 but the
file can be hand-edited or recreated by a shell that defaults to something else.

Args:
    buffer (Buffer): Raw file bytes.

Returns:
    string: Decoded text, with any byte-order mark stripped.
*/
function decodeFileText(buffer: Buffer): string {
  if (buffer.length >= 2 && buffer[0] === 0xff && buffer[1] === 0xfe) {
    return buffer.slice(2).toString('utf16le');
  }
  if (buffer.length >= 2 && buffer[0] === 0xfe && buffer[1] === 0xff) {
    return buffer.swap16().slice(2).toString('utf16le');
  }
  const text = buffer.toString('utf8');
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/** Turn a place name into a URL- and ID-safe slug.

Args:
    name (string): Place name, e.g. "City Reliquary".

Returns:
    string: A kebab-case slug, e.g. "city-reliquary".
*/
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Build a place ID from a candidate's name, unique against every given existing ID.

Args:
    name (string): Candidate name.
    existingIds (Set<string>): IDs already in use.

Returns:
    string: A unique slug, suffixed with -2, -3, ... on collision.
*/
export function uniquePlaceId(name: string, existingIds: Set<string>): string {
  const base = slugify(name) || 'mission';
  if (!existingIds.has(base)) return base;
  let n = 2;
  while (existingIds.has(`${base}-${n}`)) n += 1;
  return `${base}-${n}`;
}

/** Remove generated missions from the store, all of them or only the given IDs.

The fixed places in src/data/places.ts are never touched.

Args:
    ids (string[]): Mission IDs to remove. Empty removes every generated mission.
    path (string): File to write. Defaults to generatedMissionsPath().

Returns:
    GeneratedMissionRecord[]: The missions that were removed.
*/
export function clearGeneratedMissions(ids: string[] = [], path: string = generatedMissionsPath()): GeneratedMissionRecord[] {
  const existing = readGeneratedMissions(path);
  const shouldRemove = (mission: GeneratedMissionRecord) => ids.length === 0 || ids.includes(mission.id);
  const removed = existing.filter(shouldRemove);
  const kept = existing.filter((mission) => !shouldRemove(mission));

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(kept, null, 2) + '\n');
  return removed;
}

/** Append newly generated missions to the store.

Args:
    candidates (MissionCandidate[]): Candidates to save, already validated and filtered.
    existingIds (Set<string>): Every place ID already in use, to avoid collisions.
    path (string): File to write. Defaults to generatedMissionsPath().

Returns:
    GeneratedMissionRecord[]: The newly added records, each with its assigned ID.
*/
export function appendGeneratedMissions(
  candidates: MissionCandidate[],
  existingIds: Set<string>,
  path: string = generatedMissionsPath()
): GeneratedMissionRecord[] {
  const existing = readGeneratedMissions(path);
  const usedIds = new Set(existingIds);
  const now = new Date().toISOString();

  const added: GeneratedMissionRecord[] = candidates.map((candidate) => {
    const id = uniquePlaceId(candidate.name, usedIds);
    usedIds.add(id);
    return {
      id,
      name: candidate.name,
      // Civic, not cultural, so a visit always pays: that is the whole point of a scouted mission,
      // and cultural places pay 0 unless CULTURAL_REWARDS is on.
      kind: 'civic',
      neighborhood: candidate.neighborhood,
      latitude: candidate.latitude,
      longitude: candidate.longitude,
      geofenceRadiusMeters: 150,
      baseRewardRlusd: candidate.baseRewardRlusd,
      solanaCollectionAddress: null,
      imageUrl: `https://placehold.co/600x600/png?text=${encodeURIComponent(candidate.name)}`,
      description: candidate.description,
      // No organization funds a scouted mission.
      sponsor: null,
      // Grok's photo check has nothing more specific to go on than its own description.
      photoHint: candidate.description,
      generatedAt: now,
      reason: candidate.reason,
    };
  });

  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify([...existing, ...added], null, 2) + '\n');
  return added;
}
