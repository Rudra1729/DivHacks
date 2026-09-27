/**POST /submissions: intake, validation, and handoff to the orchestrator.

This is the API-server boundary only. Sentinel, the pending claim, the
agent proposal, policy, XRPL payment, and the Solana mint are all run by
the Orchestrator (Arundathi's), which is injected here already wired to
the real Sentinel and storage implementations. This route's job is just
to validate the HTTP request shape, serialize one submission per user,
and translate the orchestrator's DecisionResult into an HTTP response.
*/

import { Router } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { AppConfig } from '../config';
import { validateSubmission } from '../validation/submission';
import { Orchestrator } from '../orchestrator/orchestrator';
import { DecisionStatus } from '../orchestrator/types';
import { withLock } from '../claims/lock';
import { isPolicyBypassEnabled } from '../testMode/attackFlag';
import { publishEvent } from '../events/bus';
import { asyncHandler } from './asyncHandler';

/** HTTP status for each way a submission can end.

Typed over every DecisionStatus so adding a new status without deciding its
HTTP status is a compile error. PAYMENT_UNCONFIRMED is 202 because the payment
may still land: the client should resend the same request ID to re-check it.
PAYMENT_FAILED is 502 because nothing was paid and the payment service failed.
*/
export const HTTP_STATUS_BY_DECISION: Record<DecisionStatus, number> = {
  OK: 202,
  STAMP_FAILED: 202,
  PAYMENT_UNCONFIRMED: 202,
  BLOCKED_SENTINEL: 422,
  BLOCKED_POLICY: 422,
  REJECTED_BY_LEDGER: 402,
  PAYMENT_FAILED: 502,
};

/** Build the /submissions router.

Args:
    config (AppConfig): App configuration, used for the upload size limit.
    orchestrator (Orchestrator): Runs the submission pipeline.

Returns:
    Router: The configured router.
*/
export function createSubmissionsRouter(config: AppConfig, orchestrator: Orchestrator): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes },
  });

  router.post('/submissions', upload.single('photo'), asyncHandler(async (req, res) => {
    const validation = validateSubmission(req.body, req.file);

    if (!validation.valid) {
      res.status(400).json({ errors: validation.errors });
      return;
    }

    const xrplAddress = String(req.body.xrplAddress);
    const requestId = typeof req.body.requestId === 'string' && req.body.requestId
      ? req.body.requestId
      : randomUUID();

    // One submission per user at a time: the orchestrator's duplicate-
    // request check alone doesn't stop two different requestIds for the
    // same user racing each other through Sentinel/claim/payment.
    const decision = await withLock(xrplAddress, () =>
      orchestrator.runSubmission(
        {
          requestId,
          placeId: String(req.body.placeId),
          photo: req.file!.buffer,
          latitude: Number(req.body.latitude),
          longitude: Number(req.body.longitude),
          timestamp: Date.parse(String(req.body.timestamp)),
          xrplAddress,
          solanaAddress: String(req.body.solanaAddress),
          caption: typeof req.body.caption === 'string' ? req.body.caption : undefined,
        },
        { bypassPolicy: isPolicyBypassEnabled() }
      )
    );

    publishEvent({
      type: `decision.${decision.status.toLowerCase()}`,
      decisionId: decision.decisionId,
      message: decision.reasons.join('; ') || decision.status,
    });

    res.status(HTTP_STATUS_BY_DECISION[decision.status]).json(decision);
  }));

  return router;
}
