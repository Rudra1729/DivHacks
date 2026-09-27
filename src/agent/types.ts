/**Types for the payout agent (Grok).

The agent reads a submission and proposes a payout. Its output is untrusted:
the policy engine, not the agent, decides whether a proposal is allowed.
*/

import { Place } from '../orchestrator/types';

/** A payout proposed by the agent. */
export interface AgentProposal {
  /** Amount of RLUSD to pay. Not clamped here; policy enforces the caps. */
  amount: number;
  /** XRPL address the agent wants to pay. */
  recipient: string;
  /** Short explanation for the proposal. */
  reason: string;
}

/** What the agent is shown when deciding on a payout. */
export interface AgentInput {
  place: Place;
  /** The submitting user's XRPL address. */
  xrplAddress: string;
  /** Free-text caption from the user. This is the prompt injection surface. */
  caption?: string;
}

/** Anything that can turn a submission into a payout proposal. */
export interface PayoutAgent {
  propose(input: AgentInput): Promise<AgentProposal>;
}
