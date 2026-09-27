/**GET /places: the shared list of eligible places.*/

import { Router } from 'express';
import { PLACES } from '../data/places';

export const placesRouter = Router();

placesRouter.get('/places', (_req, res) => {
  res.status(200).json({ places: PLACES });
});
