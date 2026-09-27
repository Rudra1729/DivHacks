/**POST /test/attack: test-only trigger for the policy-bypass attack test.

Per the PRD's key handling rules, "the policy bypass and attack routes
work only in test mode." This route is only mounted when the server is
running in test mode; outside test mode, createApp never calls
createTestAttackRouter, so Express returns its normal 404 for the path.
*/

import { Router } from 'express';
import { enablePolicyBypass, disablePolicyBypass } from '../testMode/attackFlag';

/** Build the /test/attack router. Only call this when config.isTestMode is true.

Returns:
    Router: The configured router.
*/
export function createTestAttackRouter(): Router {
  const router = Router();

  router.post('/test/attack', (_req, res) => {
    enablePolicyBypass();
    res.status(200).json({ policyBypassEnabled: true });
  });

  router.delete('/test/attack', (_req, res) => {
    disablePolicyBypass();
    res.status(200).json({ policyBypassEnabled: false });
  });

  return router;
}
