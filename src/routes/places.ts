/**GET /places: the shared list of eligible places.*/

import { Router } from 'express';
import { scaleReward } from '../agent/grok';
import { AppConfig } from '../config';
import { PLACES } from '../data/places';

/** Build the places router.

Each place also carries rewardRlusd, what a verified visit pays right now:
0 for a cultural place while cultural rewards are off, otherwise the base
reward after REWARD_SCALE.

Args:
    config (AppConfig): Supplies rewardScale and culturalRewards.

Returns:
    Router: The router serving GET /places.
*/
export function createPlacesRouter(config: Pick<AppConfig, 'rewardScale' | 'culturalRewards'>): Router {
  const router = Router();
  const places = PLACES.map((place) => ({
    ...place,
    rewardRlusd:
      place.kind === 'cultural' && !config.culturalRewards
        ? 0
        : scaleReward(place.baseRewardRlusd, config.rewardScale),
  }));

  router.get('/places', (_req, res) => {
    res.status(200).json({ places });
  });
  return router;
}
