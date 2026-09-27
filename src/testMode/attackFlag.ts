/**In-memory flag for the test-only policy bypass.

The orchestrator (Arundathi) checks this flag to decide whether to skip
the policy engine, for the bypass attack test. Only reachable through a
route that is not mounted outside test mode, see routes/testAttack.ts.
*/

let policyBypassEnabled = false;

/** Enable the policy bypass for the current process. */
export function enablePolicyBypass(): void {
  policyBypassEnabled = true;
}

/** Disable the policy bypass for the current process. */
export function disablePolicyBypass(): void {
  policyBypassEnabled = false;
}

/** Check whether the policy bypass is currently enabled.

Returns:
    boolean: True if the bypass is enabled.
*/
export function isPolicyBypassEnabled(): boolean {
  return policyBypassEnabled;
}
