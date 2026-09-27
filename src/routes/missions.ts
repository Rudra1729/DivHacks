/**POST /missions/refresh: run the weekly mission scout on demand.

Same scout as `npm run missions:refresh`, reachable over HTTP so a demo (or
a real weekly scheduler later) can trigger it without shelling in. Never
returns an error for a bad or missing Grok reply: the scout falls back to
its built-in pool, so this route always returns at least one new mission.
*/

import { Router } from 'express';
import { AppConfig } from '../config';
import { getAllPlaces, Place } from '../data/places';
import { GrokMissionScout } from '../missions/grokScout';
import { appendGeneratedMissions } from '../missions/store';
import { publishEvent } from '../events/bus';

const MAX_COUNT_PER_REQUEST = 3;

/** Build the /missions/refresh router.

Args:
    config (AppConfig): App configuration, for the Grok API settings.

Returns:
    Router: The configured router.
*/
export function createMissionsRouter(config: AppConfig): Router {
  const router = Router();
  const scout = new GrokMissionScout({
    apiKey: config.grokApiKey,
    model: config.grokModel,
    endpoint: config.grokEndpoint,
  });

  router.post('/missions/refresh', async (req, res) => {
    const requested = Number(req.body?.count);
    const count = Number.isFinite(requested) ? Math.min(MAX_COUNT_PER_REQUEST, Math.max(1, Math.trunc(requested))) : 1;

    try {
      const existingPlaces = getAllPlaces();
      const candidates = await scout.scout({ existingPlaces, count });
      if (candidates.length === 0) {
        res.status(200).json({ added: [] });
        return;
      }

      const existingIds = new Set(existingPlaces.map((place) => place.id));
      const added: Place[] = appendGeneratedMissions(candidates, existingIds);
      for (const place of added) {
        publishEvent({ type: 'mission.generated', message: `New mission scouted: ${place.name} (${place.neighborhood})` });
      }
      res.status(200).json({ added });
    } catch (error) {
      res.status(502).json({ errors: [`could not scout a new mission: ${error instanceof Error ? error.message : String(error)}`] });
    }
  });

  return router;
}
