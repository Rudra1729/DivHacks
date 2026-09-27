/**Weekly mission scout: fully automatic, no review step.

Asks Grok for new overlooked NYC missions, validates and filters them
(must be in NYC, must not duplicate an existing place), and appends them
straight to the generated missions file. GET /places serves them
immediately, no restart needed.

Usage:
    npm run missions:refresh                add MISSIONS_PER_RUN (default 1) missions
    MISSIONS_PER_RUN=3 npm run missions:refresh
*/

import { getAllPlaces } from '../../src/data/places';
import { GrokMissionScout } from '../../src/missions/grokScout';
import { appendGeneratedMissions } from '../../src/missions/store';

async function main(): Promise<void> {
  const existingPlaces = getAllPlaces();
  const count = Math.max(1, Number(process.env.MISSIONS_PER_RUN) || 1);

  const scout = new GrokMissionScout({
    apiKey: process.env.GROK_API_KEY,
    model: process.env.GROK_MODEL ?? 'grok-4',
    endpoint: process.env.GROK_ENDPOINT ?? 'https://api.x.ai/v1/chat/completions',
  });

  console.log(`Scouting ${count} new mission(s) against ${existingPlaces.length} existing place(s)...`);
  const candidates = await scout.scout({ existingPlaces, count });

  if (candidates.length === 0) {
    console.log('No new missions this run: every candidate was filtered out (duplicate or outside NYC).');
    return;
  }

  const existingIds = new Set(existingPlaces.map((place) => place.id));
  const added = appendGeneratedMissions(candidates, existingIds);

  console.log(`Added ${added.length} mission(s):`);
  for (const mission of added) {
    console.log(`  ${mission.id}: ${mission.name} (${mission.neighborhood}) — ${mission.baseRewardRlusd} RLUSD`);
    console.log(`    ${mission.latitude}, ${mission.longitude}`);
    console.log(`    ${mission.reason}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
