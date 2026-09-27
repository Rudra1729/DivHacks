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

/** The only facts the payout reviewer is shown. All of them come from our own
    systems, never from the visitor. The caption is left out on purpose, and so
    is the agent's `reason`: the agent wrote it after reading the caption, so it
    can carry a prompt injection forward. */
export interface ReviewInput {
  placeName: string;
  /** The reward for this place after the reward scale, in RLUSD. */
  baseReward: number;
  /** What the agent proposed, in RLUSD. */
  proposedAmount: number;
  /** Whether the proposal pays the wallet that submitted the visit. */
  recipientIsSubmitter: boolean;
  /** RLUSD the submitter was already paid today, per the ledger and the database. */
  paidTodayByVisitor: number;
}

/** The reviewer's second opinion. It can only lower or stop a payout. */
export interface ReviewVerdict {
  decision: 'approve' | 'reduce' | 'reject';
  /** The lower amount to pay. Only read when the decision is 'reduce'. */
  amount?: number;
  reason: string;
}

/** A second, independent check on a payout the policy engine already allowed. */
export interface PayoutReviewer {
  /** Give a verdict on a proposed payout. May throw, which the orchestrator
      treats as the reviewer being unavailable. */
  review(input: ReviewInput): Promise<ReviewVerdict>;
}
