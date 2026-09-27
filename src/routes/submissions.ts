/**POST /submissions: intake, validation, and Sentinel verification.

This is the API-server boundary plus Sentinel. The orchestrator handoff
(Grok, policy, XRPL, Solana) is separate follow-up work owned by Arundathi;
once Sentinel passes, this route currently just accepts the submission.
*/

import { Router } from 'express';
import multer from 'multer';
import Database from 'better-sqlite3';
import { AppConfig } from '../config';
import { validateSubmission } from '../validation/submission';
import { getPlaceById } from '../data/places';
import { runSentinelChecks, BLOCKED_SENTINEL } from '../sentinel';
import { recordPhotoHash } from '../db/photoFingerprints';

/** Build the /submissions router.

Args:
    config (AppConfig): App configuration, used for the upload size limit.
    db (Database.Database): Open database handle, for Sentinel's replay check.

Returns:
    Router: The configured router.
*/
export function createSubmissionsRouter(config: AppConfig, db: Database.Database): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes },
  });

  router.post('/submissions', upload.single('photo'), (req, res) => {
    const validation = validateSubmission(req.body, req.file);

    if (!validation.valid) {
      res.status(400).json({ errors: validation.errors });
      return;
    }

    const place = getPlaceById(String(req.body.placeId));
    const sentinel = runSentinelChecks(db, {
      place: place!,
      latitude: Number(req.body.latitude),
      longitude: Number(req.body.longitude),
      timestamp: String(req.body.timestamp),
      photoBuffer: req.file!.buffer,
    });

    if (!sentinel.passed) {
      res.status(422).json({
        status: BLOCKED_SENTINEL,
        reasons: sentinel.checks.filter((check) => !check.passed).map((check) => check.message),
      });
      return;
    }

    recordPhotoHash(db, sentinel.photoHash);
    res.status(202).json({ accepted: true, photoHash: sentinel.photoHash });
  });

  return router;
}
