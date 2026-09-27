/**GET /places: every place a user can currently complete a mission at.

Includes the fixed list plus anything the weekly mission scout has generated
since (src/missions).
*/

import { Router } from 'express';
import { getAllPlaces } from '../data/places';

export const placesRouter = Router();

placesRouter.get('/places', (_req, res) => {
  res.status(200).json({ places: getAllPlaces() });
});
