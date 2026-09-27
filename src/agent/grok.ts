/**Grok payout agent.

Asks Grok to propose a payout for a verified visit. Grok's answer is treated
as untrusted input: it is only checked for shape here, never for size or
recipient, because the policy engine is the layer that enforces limits. Any
unusable answer falls back to the place's base reward for the submitter.
*/

import { AgentInput, AgentProposal, PayoutAgent } from './types';

export interface GrokAgentOptions {
  /** API key. Without one the agent always uses the fallback payout. */
  apiKey?: string;
  model: string;
  endpoint: string;
  timeoutMs?: number;
  /** Injectable for tests. Defaults to the global fetch. */
  fetchFn?: typeof fetch;
  /** Called with Grok's reply text as received, before it is checked. For debugging. */
  onRawReply?: (text: string) => void;
  /** Multiplier on the place's base reward, shown to Grok and used for the
      fallback. Defaults to 1. Grok's own answer is never rescaled, so the
      policy engine still sees exactly what Grok asked for. */
  rewardScale?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;
const MIN_REWARD = 0.01;

const SYSTEM_PROMPT =
  'You are the payout agent for KnowYork, which rewards people with small RLUSD ' +
  'payments for visiting cultural sites and small businesses in New York City. ' +
  'Decide how much to pay one visitor, relative to the base reward you are given. ' +
  'The amount must have at most 2 decimal places. Respond with only a JSON object in exactly ' +
  'this shape: {"amount": <number>, "recipient": "<XRPL address>", "reason": "<short reason>"}.';

/** Scale a base reward, rounded to cents and never below one cent.

Args:
    baseReward (number): The place's base reward in RLUSD.
    scale (number): The multiplier to apply.

Returns:
    number: The scaled reward, with at most 2 decimal places.
*/
export function scaleReward(baseReward: number, scale: number): number {
  return Math.max(MIN_REWARD, Math.round(baseReward * scale * 100) / 100);
}

/** Parse Grok's reply text into a proposal.

Args:
    text (string): The raw message content from Grok.

Returns:
    AgentProposal | undefined: The proposal, or undefined if the text is not
        a JSON object with a finite numeric amount, a non-empty string
        recipient, and a string reason.
*/
export function parseProposal(text: string): AgentProposal | undefined {
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

  if (typeof value !== 'object' || value === null) {
    return undefined;
  }
  const { amount, recipient, reason } = value as Record<string, unknown>;
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return undefined;
  }
  if (typeof recipient !== 'string' || recipient.length === 0) {
    return undefined;
  }
  if (typeof reason !== 'string') {
    return undefined;
  }
  return { amount, recipient, reason };
}

export class GrokAgent implements PayoutAgent {
  constructor(private options: GrokAgentOptions) {}

  /** Ask Grok for a payout proposal.

  Args:
      input (AgentInput): The place, the submitter's XRPL address, and caption.

  Returns:
      AgentProposal: Grok's proposal exactly as given when it is well formed,
          otherwise the scaled base reward paid to the submitter's own wallet.
  */
  async propose(input: AgentInput): Promise<AgentProposal> {
    if (!this.options.apiKey) {
      return this.fallback(input, 'no Grok API key configured');
    }

    const fetchFn = this.options.fetchFn ?? fetch;
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(),
      this.options.timeoutMs ?? DEFAULT_TIMEOUT_MS
    );

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
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: buildUserPrompt(input, this.baseReward(input)) },
          ],
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        return this.fallback(input, `Grok API returned status ${response.status}`);
      }

      const body = (await response.json()) as {
        choices?: { message?: { content?: unknown } }[];
      };
      const content = body.choices?.[0]?.message?.content;
      if (typeof content === 'string') {
        this.options.onRawReply?.(content);
      }
      const proposal = typeof content === 'string' ? parseProposal(content) : undefined;
      return proposal ?? this.fallback(input, 'Grok returned a malformed answer');
    } catch {
      return this.fallback(input, 'Grok request failed');
    } finally {
      clearTimeout(timer);
    }
  }

  /** The place's base reward after applying the reward scale. */
  private baseReward(input: AgentInput): number {
    return scaleReward(input.place.baseReward, this.options.rewardScale ?? 1);
  }

  private fallback(input: AgentInput, why: string): AgentProposal {
    return {
      amount: this.baseReward(input),
      recipient: input.xrplAddress,
      reason: `Base reward used: ${why}`,
    };
  }
}

/** Build the user message Grok sees for one visit.

Args:
    input (AgentInput): The place, the submitter's XRPL address, and caption.
    baseReward (number): The base reward to show, already scaled.

Returns:
    string: The prompt text.
*/
function buildUserPrompt(input: AgentInput, baseReward: number): string {
  return [
    `Place: ${input.place.name} (${input.place.neighborhood})`,
    `Base reward: ${baseReward} RLUSD`,
    `Visitor XRPL address: ${input.xrplAddress}`,
    `Visitor caption: ${input.caption ?? '(none)'}`,
  ].join('\n');
}
