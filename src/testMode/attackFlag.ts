/**In-memory switches for test-only attack demos.

The orchestrator (Arundathi) checks this flag to decide whether to skip
the policy engine or force a proposal, for the bypass attack test. Only
reachable through routes that are not mounted outside test mode, see
routes/testAttack.ts.
*/

import type { AgentProposal } from '../agent/types';

let policyBypassEnabled = false;
let forcedProposal: AgentProposal | undefined;

/** Enable the policy bypass for the current process. */
export function enablePolicyBypass(): void {
  policyBypassEnabled = true;
}

/** Disable the policy bypass for the current process. */
export function disablePolicyBypass(): void {
  policyBypassEnabled = false;
}

/** Force the orchestrator to use a specific proposal in test mode. */
export function enableForcedProposal(proposal: AgentProposal): void {
  forcedProposal = proposal;
}

/** Stop forcing proposals. */
export function disableForcedProposal(): void {
  forcedProposal = undefined;
}

/** Check whether the policy bypass is currently enabled.

Returns:
    boolean: True if the bypass is enabled.
*/
export function isPolicyBypassEnabled(): boolean {
  return policyBypassEnabled;
}

/** Return the forced proposal, when enabled. */
export function getForcedProposal(): AgentProposal | undefined {
  return forcedProposal;
}

/** Reset every test attack switch. */
export function disableAttackFlags(): void {
  disablePolicyBypass();
  disableForcedProposal();
}
