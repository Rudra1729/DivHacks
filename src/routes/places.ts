/**GET /places: the shared list of eligible places, each marked payable or not.

A place is payable when the agent wallet's RLUSD balance, read from the
validated ledger, covers that place's reward. That lets a visitor see that a
reward is backed before they travel to it. The balance read is cached for a
few seconds so many page loads make one ledger read.

If the ledger cannot be read, every place is reported as not payable and
payableCheck says why, since a reward cannot be promised on a guess.
*/

import { Router } from 'express';
import { PLACES } from '../data/places';
import { AgentBalanceCache, coversReward, rewardFor } from '../solvency/solvency';
import { XrplService } from '../xrpl/types';
import { asyncHandler } from './asyncHandler';

export interface PlacesRouterOptions {
  /** Multiplier on each place's reward, the same one the agent uses. Defaults to 1. */
  rewardScale?: number;
  /** How long a balance read is reused, in milliseconds. Defaults to 10 seconds. */
  ttlMs?: number;
}

/** Build the /places router.

Args:
    xrpl (XrplService): Where the agent wallet balance is read from.
    options (PlacesRouterOptions): Reward scale and cache window.

Returns:
    Router: The configured router.
*/
export function createPlacesRouter(
  xrpl: Pick<XrplService, 'getRlusdBalance' | 'getAgentAddress'>,
  options: PlacesRouterOptions = {}
): Router {
  const router = Router();
  const balances = new AgentBalanceCache(xrpl, { ttlMs: options.ttlMs });

  router.get('/places', asyncHandler(async (_req, res) => {
    const balance = await balances.read();
    res.status(200).json({
      payableCheck: balance === null ? 'ledger_unreadable' : 'ok',
      places: PLACES.map((place) => ({
        ...place,
        payable:
          balance !== null &&
          coversReward(balance, rewardFor({ baseReward: place.baseRewardRlusd }, options.rewardScale)),
      })),
    });
  }));

  return router;
}
