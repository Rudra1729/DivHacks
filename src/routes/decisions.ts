/**GET /decisions/:id: a single decision with its full audit history.*/

import { Router } from 'express';
import Database from 'better-sqlite3';
import { getDecision } from '../db/decisions';
import { listAuditEvents } from '../db/auditEvents';

/** Build the /decisions router.

Args:
    db (Database.Database): Open database handle.

Returns:
    Router: The configured router.
*/
export function createDecisionsRouter(db: Database.Database): Router {
  const router = Router();

  router.get('/decisions/:id', (req, res) => {
    const decision = getDecision(db, req.params.id);

    if (!decision) {
      res.status(404).json({ error: 'decision not found' });
      return;
    }

    res.status(200).json({
      decision,
      history: listAuditEvents(db, decision.id),
    });
  });

  return router;
}
