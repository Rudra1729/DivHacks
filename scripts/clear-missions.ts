/**Remove missions added by the "New Mission" button, so the map shows only the fixed places.

Useful before a demo: clear them, then press New Mission to scout one live.
The fixed places in src/data/places.ts are never touched. Safe to run while
the server is up; an open page drops the removed pins when its window is
focused again.

Usage:
    npm run missions:clear                       # remove every generated mission
    npm run missions:clear -- waterfront-museum  # remove only these IDs
*/

import { clearGeneratedMissions, generatedMissionsPath } from '../src/missions/store';

/** Remove the generated missions named on the command line, or all of them, and print what went. */
function main(): void {
  const ids = process.argv.slice(2);
  const path = generatedMissionsPath();
  const removed = clearGeneratedMissions(ids, path);

  if (removed.length === 0) {
    console.log(ids.length ? `No generated mission with ID ${ids.join(', ')} in ${path}` : `No generated missions in ${path}`);
    return;
  }
  console.log(`Removed ${removed.length} generated mission${removed.length === 1 ? '' : 's'} from ${path}:`);
  removed.forEach((mission) => console.log(`  ${mission.id}  (${mission.name}, ${mission.neighborhood})`));
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
