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
  MAX_PER_DAY,
  MAX_PER_TASK,
} from './rules';
import { PolicyContext, PolicyResult } from './types';

/** Logged with every decision. Bump it whenever a rule or cap changes. */
export const POLICY_VERSION = '1.1.0';

/** The per-task and daily caps after applying the reward scale.

Args:
    scale (number): REWARD_SCALE, in (0, 1]. 1 gives the full caps.

Returns:
    { perTask: number, perDay: number }: The caps in RLUSD, rounded to cents
        and never below one cent.
*/
export function scaledCaps(scale: number): { perTask: number; perDay: number } {
  const toScaled = (cap: number) => Math.max(0.01, Math.round(cap * scale * 100) / 100);
  return { perTask: toScaled(MAX_PER_TASK), perDay: toScaled(MAX_PER_DAY) };
}

/** Judge a payout proposal against the fixed spending rules.

Args:
    proposal (AgentProposal): What the agent wants to pay, and to whom.
    context (PolicyContext): Submitter wallet, place, allowlist, today's
        total, and the cap scale.

Returns:
    PolicyResult: ok with the policy version, or the plain-language list of
        every violated rule.
*/
export function evaluatePolicy(proposal: AgentProposal, context: PolicyContext): PolicyResult {
  const caps = scaledCaps(context.capScale ?? 1);
  const violations: (string | undefined)[] = [
    checkAmountBounds(proposal.amount, caps.perTask),
    checkRecipient(proposal.recipient, context.submitterXrplAddress),
    checkPlaceAllowed(context.placeId, context.allowedPlaceIds),
  ];

  // Precision and daily math are meaningless for NaN or Infinity, which the
  // bounds check has already reported.
  if (Number.isFinite(proposal.amount)) {
    violations.push(
      checkDecimalPlaces(proposal.amount),
      checkDailyCap(proposal.amount, context.dailyTotal, caps.perDay)
    );
  }

  const failed = violations.filter((v): v is string => v !== undefined);
  if (failed.length > 0) {
    return { ok: false, policyVersion: POLICY_VERSION, violations: failed };
  }
  return { ok: true, policyVersion: POLICY_VERSION };
}
