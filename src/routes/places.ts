/**GET /places: the shared list of eligible places.*/

import Database from 'better-sqlite3';
import { Router } from 'express';
import { scaleReward } from '../agent/grok';
import { AppConfig } from '../config';
import { PLACES } from '../data/places';
import { getHighestStampSerial } from '../db/decisions';
import { RARITY_TIERS, STAMP_SUPPLY_PER_PLACE, tierForSerial } from '../solana/rarity';

/** The rarity ladder as serial ranges, rarest first, ending with Late Explorer. */
const RARITY_LADDER = [
  ...RARITY_TIERS.map((entry, i) => ({
    tier: entry.tier,
    fromSerial: i === 0 ? 1 : RARITY_TIERS[i - 1].maxSerial + 1,
    toSerial: entry.maxSerial as number | null,
  })),
  { tier: 'Late Explorer', fromSerial: STAMP_SUPPLY_PER_PLACE + 1, toSerial: null },
];

/** Build the places router.

Each place also carries rewardRlusd, what a verified visit pays right now:
0 for a cultural place while cultural rewards are off, otherwise the base
reward after REWARD_SCALE. Its rarity says how many stamps have been found
there and which serial and tier the next finder gets. The response also
includes the rarity ladder and the per-place supply.

Args:
    config (AppConfig): Supplies rewardScale and culturalRewards.
    db (Database.Database): Decisions database, read for stamp serials.

Returns:
    Router: The router serving GET /places.
*/
export function createPlacesRouter(
  config: Pick<AppConfig, 'rewardScale' | 'culturalRewards'>,
  db: Database.Database
): Router {
  const router = Router();

  router.get('/places', (_req, res) => {
    const places = PLACES.map((place) => {
      const found = getHighestStampSerial(db, place.id);
      return {
        ...place,
        rewardRlusd:
          place.kind === 'cultural' && !config.culturalRewards
            ? 0
            : scaleReward(place.baseRewardRlusd, config.rewardScale),
        rarity: { found, nextSerial: found + 1, nextTier: tierForSerial(found + 1) },
      };
    });
    res.status(200).json({ places, rarityTiers: RARITY_LADDER, stampSupply: STAMP_SUPPLY_PER_PLACE });
  });
  return router;
}
