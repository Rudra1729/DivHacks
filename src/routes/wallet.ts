/**GET /me/nft, GET /me/rlusd-balance, and GET /me/transactions: the
wallet views for a logged-in user. All three read the user's own
addresses off req.user (set by requireAuth), never an address supplied
by the client. Each stamp carries the RLUSD its visit paid, read from
the decisions table.
*/

import { Router } from 'express';
import Database from 'better-sqlite3';
import { requireAuth } from '../auth/middleware';
import { getStamps } from '../integrations/solana';
import { getDecisionsByXrplAddress } from '../db/decisions';
import { getPlaceById } from '../data/places';
import { XrplService } from '../xrpl/types';
import { getDecision } from '../db/decisions';
import { asyncHandler } from './asyncHandler';

/** RLUSD a decision paid, for showing on its stamp card.

Args:
    db (Database.Database): Open database handle.
    decisionId (string): The decision the stamp was minted for.

Returns:
    number: The amount paid, or 0 if the decision paid nothing (a stamp-only visit).
*/
function paidAmount(db: Database.Database, decisionId: string): number {
  const decision = getDecision(db, decisionId);
  return decision?.xrplHash ? decision.amount ?? 0 : 0;
}

/** Build the /me router.

Args:
    db (Database.Database): Open database handle, used by requireAuth.
    xrpl (XrplService): Service used to read the user's RLUSD balance.

Returns:
    Router: The configured router.
*/
export function createWalletRouter(db: Database.Database, xrpl: XrplService): Router {
  const router = Router();
  const auth = requireAuth(db);

  router.get('/me/nft', auth, asyncHandler(async (req, res) => {
    const stamps = (await getStamps(req.user!.solanaAddress)).map((stamp) => ({
      ...stamp,
      rewardRlusd: paidAmount(db, stamp.decisionId),
    }));
    res.status(200).json({ solanaAddress: req.user!.solanaAddress, stamps });
  }));

  router.get('/me/rlusd-balance', auth, asyncHandler(async (req, res) => {
    const balance = await xrpl.getRlusdBalance(req.user!.xrplAddress);
    res.status(200).json({ xrplAddress: req.user!.xrplAddress, balance });
  }));

  router.get('/me/transactions', auth, (req, res) => {
    const transactions = getDecisionsByXrplAddress(db, req.user!.xrplAddress).map((decision) => ({
      decisionId: decision.id,
      placeId: decision.placeId,
      placeName: decision.placeId ? getPlaceById(decision.placeId)?.name ?? decision.placeId : null,
      amount: decision.amount,
      status: decision.status,
      xrplHash: decision.xrplHash,
      createdAt: decision.createdAt,
    }));
    res.status(200).json({ transactions });
  });

  return router;
}
