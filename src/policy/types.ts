/**Types for the policy engine.*/

/** Facts the policy engine needs that are not part of the proposal itself. */
export interface PolicyContext {
  /** XRPL address the user submitted. The only address a payout may go to. */
  submitterXrplAddress: string;
  placeId: string;
  /** IDs of places that are allowed to pay out. */
  allowedPlaceIds: string[];
  /** RLUSD already paid to the submitter today. Callers pass the higher of
      the database and ledger totals. */
  dailyTotal: number;
}

/** Pass, or every violated rule in plain words. Always carries the version. */
export type PolicyResult =
  | { ok: true; policyVersion: string }
  | { ok: false; policyVersion: string; violations: string[] };
