/**Deterministic payout reviewer that applies the reviewer checklist in code.

Used in tests, and anywhere a reviewer is needed without calling Grok. It makes
the same three calls the real reviewer's prompt asks for, so tests can tell a
sensible second opinion from a broken one.
*/

import { MAX_PER_DAY, toCents } from '../policy/rules';
import { PayoutReviewer, ReviewInput, ReviewVerdict } from './types';

/** How far above the base reward a payout may go before it is reduced. */
const ALLOWED_MULTIPLE = 1.5;

export class FakeReviewer implements PayoutReviewer {
  /** Review a payout using the fixed checklist.

  Args:
      input (ReviewInput): The trusted facts about the payout.

  Returns:
      Promise<ReviewVerdict>: Reject if the recipient is not the submitter or
          the payout would pass the daily cap, reduce to the base reward if
          it is above 1.5 times the base reward, otherwise approve.
  */
  async review(input: ReviewInput): Promise<ReviewVerdict> {
    if (!input.recipientIsSubmitter) {
      return { decision: 'reject', reason: 'the recipient is not the submitter' };
    }
    if (toCents(input.paidTodayByVisitor) + toCents(input.proposedAmount) > toCents(MAX_PER_DAY)) {
      return { decision: 'reject', reason: `this payout would take the visitor past ${MAX_PER_DAY} RLUSD today` };
    }
    if (toCents(input.proposedAmount) > toCents(input.baseReward) * ALLOWED_MULTIPLE) {
      return {
        decision: 'reduce',
        amount: input.baseReward,
        reason: `above ${ALLOWED_MULTIPLE} times the ${input.baseReward} RLUSD base reward`,
      };
    }
    return { decision: 'approve', reason: 'within the allowed range of the base reward' };
  }
}
