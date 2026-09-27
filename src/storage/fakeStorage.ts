/**In-memory storage stand-in.

Enough behavior for the orchestrator and policy tests. The inspection
helpers at the bottom exist only so tests can check what was written.
*/

import { DecisionResult, DecisionStatus, Place } from '../orchestrator/types';
import { MintStampInput } from '../solana/types';
import { ClaimInput, ClaimStatus, StorageLayer } from './types';

const COUNTS_AS_PAID: DecisionStatus[] = ['OK', 'STAMP_FAILED', 'PAYMENT_UNCONFIRMED'];

export interface StoredClaim extends ClaimInput {
  status: ClaimStatus;
}

export class FakeStorage implements StorageLayer {
  private places: Map<string, Place>;
  private decisions = new Map<string, DecisionResult>();
  private claims: StoredClaim[] = [];
  private stampRetries: MintStampInput[] = [];

  /** Create the fake storage.

  Args:
      places (Place[]): The places that exist and are allowed to pay out.
  */
  constructor(places: Place[] = []) {
    this.places = new Map(places.map((p) => [p.id, p]));
  }

  async getDecisionByRequestId(requestId: string): Promise<DecisionResult | undefined> {
    return this.decisions.get(requestId);
  }

  async getPlace(placeId: string): Promise<Place | undefined> {
    return this.places.get(placeId);
  }

  async listPlaceIds(): Promise<string[]> {
    return [...this.places.keys()];
  }

  /** Sum of saved payments to an address. The fake does not track dates.

  An unconfirmed payment counts, since it may still land. */
  async getDailyTotal(xrplAddress: string): Promise<number> {
    let total = 0;
    for (const d of this.decisions.values()) {
      if (COUNTS_AS_PAID.includes(d.status) && d.proposal?.recipient === xrplAddress) {
        total += d.proposal.amount;
      }
    }
    return total;
  }

  async markClaimPending(claim: ClaimInput): Promise<void> {
    this.claims.push({ ...claim, status: 'pending' });
  }

  async updateClaimStatus(decisionId: string, status: ClaimStatus): Promise<void> {
    const claim = this.claims.find((c) => c.decisionId === decisionId);
    if (claim) {
      claim.status = status;
    }
  }

  async queueStampRetry(input: MintStampInput): Promise<void> {
    this.stampRetries.push(input);
  }

  async saveDecision(requestId: string, decision: DecisionResult): Promise<void> {
    this.decisions.set(requestId, decision);
  }

  getClaims(): StoredClaim[] {
    return [...this.claims];
  }

  getStampRetries(): MintStampInput[] {
    return [...this.stampRetries];
  }
}
