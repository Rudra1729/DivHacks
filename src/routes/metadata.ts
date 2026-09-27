/**GET /metadata/:decisionId: stamp metadata pages for Rudra's Solana mint.

URL pattern agreed with Rudra: GET /metadata/:decisionId. The Solana stamp
metadata includes place, neighborhood, image, decision ID, and XRPL
payment hash, per the PRD's "Data and audit trail" section.
*/

import { Router } from 'express';
import Database from 'better-sqlite3';
import { getDecision } from '../db/decisions';
import { getPlaceById } from '../data/places';

/** Build the /metadata router.

Args:
    db (Database.Database): Open database handle.

Returns:
    Router: The configured router.
*/
export function createMetadataRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/metadata/:decisionId', (req, res) => {
    const decision = getDecision(db, req.params.decisionId);

    if (!decision) {
      res.status(404).json({ error: 'decision not found' });
      return;
    }

    const place = decision.placeId ? getPlaceById(decision.placeId) : undefined;

    if (!place) {
      res.status(404).json({ error: 'place not found for this decision' });
      return;
    }

    res.status(200).json({
      decisionId: decision.id,
      place: place.name,
      neighborhood: place.neighborhood,
      image: place.imageUrl,
      xrplPaymentHash: decision.xrplHash,
    });
  });

  return router;
}
