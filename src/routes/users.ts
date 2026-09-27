/**GET /users/:wallet/stamps: a user's stamps, via Rudra's Solana integration.*/

import { Router } from 'express';
import { getStamps } from '../integrations/solana';

export const usersRouter = Router();

usersRouter.get('/users/:wallet/stamps', async (req, res) => {
  const stamps = await getStamps(req.params.wallet);
  res.status(200).json({ stamps });
});
