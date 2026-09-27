/**GET /places: the shared list of eligible places, each marked payable or not.

A place is payable when the agent wallet's RLUSD balance, read from the
validated ledger, covers that place's reward. That lets a visitor see that a
reward is backed before they travel to it. The balance read is cached for a
few seconds so many page loads make one ledger read.

If the ledger cannot be read, every place is reported as not payable and
payableCheck says why, since a reward cannot be promised on a guess.
*/

import Database from 'better-sqlite3';
import { Router } from 'express';
import { scaleReward } from '../agent/grok';
import { PLACES } from '../data/places';
import { getHighestStampSerial } from '../db/decisions';
import { RARITY_TIERS, STAMP_SUPPLY_PER_PLACE, tierForSerial } from '../solana/rarity';
import { AgentBalanceCache, coversReward } from '../solvency/solvency';
import { XrplService } from '../xrpl/types';
import { asyncHandler } from './asyncHandler';

/** The rarity ladder as serial ranges, rarest first, ending with Late Explorer. */
const RARITY_LADDER = [
  ...RARITY_TIERS.map((entry, i) => ({
    tier: entry.tier,
    fromSerial: i === 0 ? 1 : RARITY_TIERS[i - 1].maxSerial + 1,
    toSerial: entry.maxSerial as number | null,
  })),
  { tier: 'Late Explorer', fromSerial: STAMP_SUPPLY_PER_PLACE + 1, toSerial: null },
];

export interface PlacesRouterOptions {
  /** Multiplier on each place's reward, the same one the agent uses. Defaults to 1. */
  rewardScale?: number;
  /** Whether cultural visits pay RLUSD. Defaults to false: stamp only. */
  culturalRewards?: boolean;
  /** How long a balance read is reused, in milliseconds. Defaults to 10 seconds. */
  ttlMs?: number;
}

/** Build the /places router.

Each place also carries rewardRlusd, what a verified visit pays right now:
0 for a cultural place while cultural rewards are off, otherwise the base
reward after REWARD_SCALE. payable says whether the agent wallet covers that
reward. Its rarity says how many stamps have been found there and which
serial and tier the next finder gets. The response also includes the rarity
ladder and the per-place supply.

Args:
    xrpl (XrplService): Where the agent wallet balance is read from.
    db (Database.Database): Decisions database, read for stamp serials.
    options (PlacesRouterOptions): Reward scale, cultural rewards, and cache window.

Returns:
    Router: The configured router.
*/
export function createPlacesRouter(
  xrpl: Pick<XrplService, 'getRlusdBalance' | 'getAgentAddress'>,
  db: Database.Database,
  options: PlacesRouterOptions = {}
): Router {
  const router = Router();
  const balances = new AgentBalanceCache(xrpl, { ttlMs: options.ttlMs });

  router.get('/places', asyncHandler(async (_req, res) => {
    const balance = await balances.read();
    const places = PLACES.map((place) => {
      const found = getHighestStampSerial(db, place.id);
      const rewardRlusd =
        place.kind === 'cultural' && !options.culturalRewards
          ? 0
          : scaleReward(place.baseRewardRlusd, options.rewardScale ?? 1);
      return {
        ...place,
        rewardRlusd,
        payable: balance !== null && coversReward(balance, rewardRlusd),
        rarity: { found, nextSerial: found + 1, nextTier: tierForSerial(found + 1) },
      };
    });
    res.status(200).json({
      payableCheck: balance === null ? 'ledger_unreadable' : 'ok',
      places,
      rarityTiers: RARITY_LADDER,
      stampSupply: STAMP_SUPPLY_PER_PLACE,
    });
  }));

  return router;
}
