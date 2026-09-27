/**POST /submissions: intake and validation for a mission submission.

This is the API-server boundary only: it accepts the upload, validates the
required fields and photo, and reports every problem at once. Sentinel
checks (location, freshness, replay) and the orchestrator handoff are
separate follow-up work.
*/

import { Router } from 'express';
import multer from 'multer';
import { AppConfig } from '../config';
import { validateSubmission } from '../validation/submission';

/** Build the /submissions router.

Args:
    config (AppConfig): App configuration, used for the upload size limit.

Returns:
    Router: The configured router.
*/
export function createSubmissionsRouter(config: AppConfig): Router {
  const router = Router();
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: config.maxUploadBytes },
  });

  router.post('/submissions', upload.single('photo'), (req, res) => {
    const result = validateSubmission(req.body, req.file);

    if (!result.valid) {
      res.status(400).json({ errors: result.errors });
      return;
    }

    res.status(202).json({ accepted: true });
  });

  return router;
}
