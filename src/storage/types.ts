/**Storage interface consumed by the orchestrator.

The storage owner builds the real SQLite version. This shape is an
assumption until it is agreed with them in chat.
*/

import { DecisionResult, Place } from '../orchestrator/types';
import { MintStampInput } from '../solana/types';

export type ClaimStatus = 'pending' | 'paid' | 'failed';

/** A user's claim on a place, written as pending before any payment. */
export interface ClaimInput {
  decisionId: string;
  xrplAddress: string;
  solanaAddress: string;
  placeId: string;
}

export interface StorageLayer {
  /** The saved decision for a request ID, if that request was already handled. */
  getDecisionByRequestId(requestId: string): Promise<DecisionResult | undefined>;
  getPlace(placeId: string): Promise<Place | undefined>;
  /** IDs of every place that is allowed to pay out. */
  listPlaceIds(): Promise<string[]>;
  /** RLUSD already paid to this XRPL address today, per the local database. */
  getDailyTotal(xrplAddress: string): Promise<number>;
  markClaimPending(claim: ClaimInput): Promise<void>;
  updateClaimStatus(decisionId: string, status: ClaimStatus): Promise<void>;
  /** Remember a stamp whose mint failed after payment, so it can be retried. */
  queueStampRetry(input: MintStampInput): Promise<void>;
  saveDecision(requestId: string, decision: DecisionResult): Promise<void>;
}
