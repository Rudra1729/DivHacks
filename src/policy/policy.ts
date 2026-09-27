/**Policy engine.

Fixed rules, no AI. It runs every rule and reports all violations together,
so a blocked proposal explains everything wrong with it at once.
*/

import { AgentProposal } from '../agent/types';
import {
  checkAmountBounds,
  checkDailyCap,
  checkDecimalPlaces,
  checkPlaceAllowed,
  checkRecipient,
} from './rules';
import { PolicyContext, PolicyResult } from './types';

/** Logged with every decision. Bump it whenever a rule or cap changes. */
export const POLICY_VERSION = '1.0.0';

/** Judge a payout proposal against the fixed spending rules.

Args:
    proposal (AgentProposal): What the agent wants to pay, and to whom.
    context (PolicyContext): Submitter wallet, place, allowlist, and today's total.

Returns:
    PolicyResult: ok with the policy version, or the plain-language list of
        every violated rule.
*/
export function evaluatePolicy(proposal: AgentProposal, context: PolicyContext): PolicyResult {
  const violations: (string | undefined)[] = [
    checkAmountBounds(proposal.amount),
    checkRecipient(proposal.recipient, context.submitterXrplAddress),
    checkPlaceAllowed(context.placeId, context.allowedPlaceIds),
  ];

  // Precision and daily math are meaningless for NaN or Infinity, which the
  // bounds check has already reported.
  if (Number.isFinite(proposal.amount)) {
    violations.push(
      checkDecimalPlaces(proposal.amount),
      checkDailyCap(proposal.amount, context.dailyTotal)
    );
  }

  const failed = violations.filter((v): v is string => v !== undefined);
  if (failed.length > 0) {
    return { ok: false, policyVersion: POLICY_VERSION, violations: failed };
  }
  return { ok: true, policyVersion: POLICY_VERSION };
}
