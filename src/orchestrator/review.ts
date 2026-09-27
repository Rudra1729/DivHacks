/**Turns the reviewer's answer into a payout decision.

This is the code that guarantees the reviewer can only lower a payout. Whatever
the reviewer says, even if it was fooled, the amount returned is never above
the amount the agent proposed. If the reviewer failed, or said something
unusable, the payout is capped at the base reward, and never raised to it.
*/

import { ReviewVerdict } from '../agent/types';

/** What came back from asking the reviewer. */
export type ReviewOutcome =
  | { kind: 'verdict'; verdict: ReviewVerdict }
  | { kind: 'failed'; error: string };

/** What to do with the payout after review.

Attributes:
    amount (number): RLUSD to pay, at most the proposal.
    message (string): What happened, for the audit trail.
    note (string | undefined): Set only when the amount was lowered, for the
        decision's reasons.
*/
export type ReviewDecision =
  | { action: 'pay'; amount: number; message: string; note?: string }
  | { action: 'reject'; reason: string };

const MIN_PAYOUT = 0.01;

/** Round down to whole cents, absorbing float noise such as 1.15 * 100. */
function floorCents(amount: number): number {
  return Math.floor(amount * 100 + 1e-9) / 100;
}

/** Decide the payout after the reviewer has had its say.

Args:
    proposed (number): What the agent proposed, already allowed by the policy engine.
    baseReward (number): The place's reward after the reward scale.
    outcome (ReviewOutcome): The reviewer's verdict, or that it failed.

Returns:
    ReviewDecision: Reject, or pay an amount that is at most the proposal.
        A reduce with an amount that is not a number, not above zero, or above
        the proposal is treated like a failed review.
*/
export function resolveReview(proposed: number, baseReward: number, outcome: ReviewOutcome): ReviewDecision {
  const fallback = (why: string): ReviewDecision => {
    const amount = Math.min(proposed, floorCents(baseReward));
    return withNote(proposed, amount, `${why}; paying at most the base reward: ${amount} RLUSD`);
  };

  if (outcome.kind === 'failed') {
    return fallback(`reviewer unavailable (${outcome.error})`);
  }

  const { verdict } = outcome;
  switch (verdict.decision) {
    case 'reject':
      return { action: 'reject', reason: verdict.reason };
    case 'approve':
      return { action: 'pay', amount: proposed, message: `reviewer approved ${proposed} RLUSD: ${verdict.reason}` };
    case 'reduce': {
      const asked = verdict.amount;
      const usable =
        typeof asked === 'number' && Number.isFinite(asked) && asked > 0 && asked <= proposed && floorCents(asked) >= MIN_PAYOUT;
      if (!usable) {
        return fallback(`reviewer asked to reduce to an unusable amount (${String(asked)})`);
      }
      const amount = Math.min(proposed, floorCents(asked));
      if (amount >= proposed) {
        return { action: 'pay', amount: proposed, message: `reviewer approved ${proposed} RLUSD: ${verdict.reason}` };
      }
      return withNote(proposed, amount, `reviewer reduced the payout from ${proposed} to ${amount} RLUSD: ${verdict.reason}`);
    }
  }
}

/** A pay decision that carries a note only when the amount really went down. */
function withNote(proposed: number, amount: number, message: string): ReviewDecision {
  if (amount < proposed) {
    return { action: 'pay', amount, message, note: `reviewer lowered the payout from ${proposed} to ${amount} RLUSD` };
  }
  return { action: 'pay', amount, message };
}
