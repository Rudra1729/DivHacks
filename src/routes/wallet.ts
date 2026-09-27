/**GET /me/nft and GET /me/rlusd-balance: the two wallet "cards" for a
logged-in user. Both read the user's own addresses off req.user (set by
requireAuth), never an address supplied by the client.
*/

import { Router } from 'express';
import Database from 'better-sqlite3';
import { requireAuth } from '../auth/middleware';
import { getStamps } from '../integrations/solana';
import { XrplService } from '../xrpl/types';
import { asyncHandler } from './asyncHandler';

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
    const stamps = await getStamps(req.user!.solanaAddress);
    res.status(200).json({ solanaAddress: req.user!.solanaAddress, stamps });
  }));

  router.get('/me/rlusd-balance', auth, asyncHandler(async (req, res) => {
    const balance = await xrpl.getRlusdBalance(req.user!.xrplAddress);
    res.status(200).json({ xrplAddress: req.user!.xrplAddress, balance });
  }));

  return router;
}
