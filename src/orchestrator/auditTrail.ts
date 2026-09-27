/**Collects the step-by-step history of one submission.

The orchestrator adds an entry as each step runs, and the whole trail is saved
right after the decision itself, so every entry has a decision to belong to.
*/

import { AuditEntry } from '../storage/types';

/** Which part of the pipeline produced an entry. */
export type AuditLayer =
  | 'orchestrator'
  | 'sentinel'
  | 'photo'
  | 'claim'
  | 'agent'
  | 'policy'
  | 'xrpl'
  | 'solana';

/** Longest message kept. Some messages contain text from the agent, which the
    visitor's caption can influence, so they are cut to a sensible size. */
export const MAX_AUDIT_MESSAGE_LENGTH = 300;

export class AuditTrail {
  private items: AuditEntry[] = [];

  /** Record one step.

  Args:
      layer (AuditLayer): Which part ran the step.
      passed (boolean): False if the step stopped or paused the submission.
      message (string): What happened.
  */
  add(layer: AuditLayer, passed: boolean, message: string): void {
    const text =
      message.length > MAX_AUDIT_MESSAGE_LENGTH
        ? `${message.slice(0, MAX_AUDIT_MESSAGE_LENGTH - 3)}...`
        : message;
    this.items.push({ layer, passed, message: text });
  }

  /** Record several messages from the same step, one entry each.

  Args:
      layer (AuditLayer): Which part ran the step.
      passed (boolean): Whether the step passed.
      messages (string[]): One message per finding, such as each Sentinel failure.
  */
  addAll(layer: AuditLayer, passed: boolean, messages: string[]): void {
    for (const message of messages) {
      this.add(layer, passed, message);
    }
  }

  /** The entries recorded so far, in order. */
  get entries(): AuditEntry[] {
    return [...this.items];
  }
}
