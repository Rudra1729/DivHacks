/**POST /test/attack: test-only trigger for the policy-bypass attack test.

Per the PRD's key handling rules, "the policy bypass and attack routes
work only in test mode." This route is only mounted when the server is
running in test mode; outside test mode, createApp never calls
createTestAttackRouter, so Express returns its normal 404 for the path.
*/

import { Router } from 'express';
import {
  disableForcedProposal,
  disablePolicyBypass,
  enableForcedProposal,
  enablePolicyBypass,
  getForcedProposal,
} from '../testMode/attackFlag';

/** Build the /test/attack router. Only call this when config.isTestMode is true.

Returns:
    Router: The configured router.
*/
export function createTestAttackRouter(): Router {
  const router = Router();

  router.post('/test/attack', (_req, res) => {
    enablePolicyBypass();
    res.status(200).json({ policyBypassEnabled: true, forcedProposal: getForcedProposal() });
  });

  router.delete('/test/attack', (_req, res) => {
    disablePolicyBypass();
    disableForcedProposal();
    res.status(200).json({ policyBypassEnabled: false, forcedProposal: undefined });
  });

  router.post('/test/attack/force-proposal', (req, res) => {
    const recipient = typeof req.body?.recipient === 'string' ? req.body.recipient : '';
    const amount = req.body?.amount === undefined ? 50 : Number(req.body.amount);
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : 'test forced proposal';
    if (!recipient || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({ errors: ['recipient and a positive amount are required'] });
      return;
    }
    const proposal = { amount, recipient, reason };
    enableForcedProposal(proposal);
    res.status(200).json({ forcedProposal: proposal });
  });

  router.delete('/test/attack/force-proposal', (_req, res) => {
    disableForcedProposal();
    res.status(200).json({ forcedProposal: undefined });
  });

  return router;
}
