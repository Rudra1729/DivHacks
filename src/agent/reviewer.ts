/**Grok payout reviewer: a second opinion that never sees the visitor's words.

The reviewer is a separate call to Grok with its own short checklist. It is
shown only trusted facts (the place, the base reward, the proposed amount,
whether the recipient is the submitter, and what was paid today). It is never
shown the caption, and never the agent's reason, because the agent wrote that
after reading the caption and it can carry a prompt injection forward.

That is the point. Asking the payout agent to re-check its own answer adds
almost nothing, since a second pass sees the same injected caption. A reviewer
that cannot see the caption cannot be argued with by it.

The reviewer can only approve, reduce, or reject. The orchestrator never pays
more than the proposal, whatever the reviewer says.
*/

import { GrokAgentOptions } from './grok';
import { PayoutReviewer, ReviewInput, ReviewVerdict } from './types';

export type GrokReviewerOptions = Pick<GrokAgentOptions, 'apiKey' | 'model' | 'endpoint' | 'timeoutMs' | 'fetchFn'>;

const DEFAULT_TIMEOUT_MS = 15000;

/** Longest reviewer reason kept. It ends up in the audit trail. */
export const MAX_REVIEW_REASON_LENGTH = 200;

export const REVIEWER_SYSTEM_PROMPT =
  'You audit payouts for a rewards program that pays small RLUSD amounts to people who visit ' +
  'cultural sites. You are given only trusted numbers, never the visitor\'s words. ' +
  'Approve amounts up to 1.5 times the base reward. ' +
  'Reduce anything higher to the base reward. ' +
  'Reject if the recipient is not the submitter. ' +
  'Reject if the amount already paid today plus this payout would be more than 10. ' +
  'Never suggest an amount higher than the proposed amount. ' +
  'Reply only with JSON in exactly this shape: ' +
  '{"decision": "approve" | "reduce" | "reject", "amount": <number, only when reducing>, "reason": "<short reason>"}.';

/** Parse the reviewer's reply text into a verdict, strictly.

Args:
    text (string): The raw message content from Grok.

Returns:
    ReviewVerdict | undefined: The verdict, or undefined if the text is not a
        JSON object with a decision of approve, reduce or reject, a text
        reason, and, for reduce, a numeric amount. An amount sent with
        approve or reject is dropped. Whether a reduce amount is usable is
        left to the orchestrator, which never pays more than the proposal.
*/
export function parseVerdict(text: string): ReviewVerdict | undefined {
  const cleaned = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '');

  let value: unknown;
  try {
    value = JSON.parse(cleaned);
  } catch {
    return undefined;
  }

  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return undefined;
  }
  const { decision, amount, reason } = value as Record<string, unknown>;
  if (decision !== 'approve' && decision !== 'reduce' && decision !== 'reject') {
    return undefined;
  }
  if (typeof reason !== 'string') {
    return undefined;
  }
  const shortReason = reason.slice(0, MAX_REVIEW_REASON_LENGTH);
  if (decision !== 'reduce') {
    return { decision, reason: shortReason };
  }
  if (typeof amount !== 'number') {
    return undefined;
  }
  return { decision, amount, reason: shortReason };
}

/** Build the user message the reviewer sees.

Only the five trusted fields are read, so anything else attached to the input
object, such as a caption, can never reach the model.

Args:
    input (ReviewInput): The trusted facts about the payout.

Returns:
    string: The prompt text.
*/
export function buildReviewPrompt(input: ReviewInput): string {
  return [
    `Place: ${input.placeName}`,
    `Base reward: ${input.baseReward} RLUSD`,
    `Proposed payout: ${input.proposedAmount} RLUSD`,
    `Recipient is the submitter: ${input.recipientIsSubmitter ? 'true' : 'false'}`,
    `Already paid to this visitor today: ${input.paidTodayByVisitor} RLUSD`,
  ].join('\n');
}

export class GrokReviewer implements PayoutReviewer {
  constructor(private options: GrokReviewerOptions) {}

  /** Ask Grok for a verdict on a proposed payout.

  Args:
      input (ReviewInput): The trusted facts about the payout.

  Returns:
      ReviewVerdict: Grok's verdict, when the reply is well formed.

  Raises:
      Error: If there is no API key, the request fails or times out, Grok
          answers with an error status, or the reply is not a valid verdict.
          The orchestrator treats any of these as the reviewer being
          unavailable and caps the payout at the base reward.
  */
  async review(input: ReviewInput): Promise<ReviewVerdict> {
    if (!this.options.apiKey) {
      throw new Error('no Grok API key configured for the reviewer');
    }

    const fetchFn = this.options.fetchFn ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

    let content: unknown;
    try {
      const response = await fetchFn(this.options.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify({
          model: this.options.model,
          temperature: 0,
          messages: [
            { role: 'system', content: REVIEWER_SYSTEM_PROMPT },
            { role: 'user', content: buildReviewPrompt(input) },
          ],
        }),
        signal: controller.signal,
      });
      if (!response.ok) {
        throw new Error(`Grok API returned status ${response.status}`);
      }
      const body = (await response.json()) as { choices?: { message?: { content?: unknown } }[] };
      content = body.choices?.[0]?.message?.content;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(message.startsWith('Grok API returned') ? message : `reviewer request failed: ${message}`);
    } finally {
      clearTimeout(timer);
    }

    const verdict = typeof content === 'string' ? parseVerdict(content) : undefined;
    if (!verdict) {
      throw new Error('reviewer returned an unusable answer');
    }
    return verdict;
  }
}
