/**GET /metadata/:decisionId: stamp metadata pages for Rudra's Solana mint.

URL pattern agreed with Rudra: GET /metadata/:decisionId. The Solana stamp
metadata includes place, neighborhood, image, decision ID, and XRPL
payment hash, per the PRD's "Data and audit trail" section. Stamps minted
with rarity also show their serial, tier, and how many numbered stamps are
left at the place, plus a standard attributes list that wallets display.
*/

import { Router } from 'express';
import Database from 'better-sqlite3';
import { getDecision, getHighestStampSerial } from '../db/decisions';
import { getPlaceById } from '../data/places';
import { STAMP_SUPPLY_PER_PLACE, isFoundOut } from '../integrations/solana';

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

    const serial = decision.stampSerial ?? null;
    const tier = decision.stampTier ?? null;
    const highestFound = getHighestStampSerial(db, place.id);

    res.status(200).json({
      name: serial ? `${place.name} #${serial}` : place.name,
      decisionId: decision.id,
      place: place.name,
      neighborhood: place.neighborhood,
      image: place.imageUrl,
      xrplPaymentHash: decision.xrplHash,
      serial,
      tier,
      supply: STAMP_SUPPLY_PER_PLACE,
      stampsFoundAtPlace: highestFound,
      remainingAtPlace: Math.max(0, STAMP_SUPPLY_PER_PLACE - highestFound),
      foundOut: isFoundOut(highestFound),
      attributes: [
        { trait_type: 'Place', value: place.name },
        { trait_type: 'Neighborhood', value: place.neighborhood },
        ...(serial && tier
          ? [
              { trait_type: 'Tier', value: tier },
              { trait_type: 'Serial', value: `${serial} of ${STAMP_SUPPLY_PER_PLACE}` },
            ]
          : []),
      ],
    });
  });

  return router;
}
