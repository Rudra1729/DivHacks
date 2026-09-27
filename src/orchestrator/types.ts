/**Shared types for the submission pipeline.

These describe what goes into the orchestrator (a submission) and what comes
out (a decision). Every decision carries one decision ID that links the
SQLite record, the XRPL payment memo, and the Solana stamp metadata.
*/

import { AgentProposal } from '../agent/types';

/** How a submission ended. */
export type DecisionStatus =
  | 'OK'
  | 'BLOCKED_SOLVENCY'
  | 'BLOCKED_SENTINEL'
  | 'BLOCKED_POLICY'
  | 'REJECTED_BY_LEDGER'
  | 'PAYMENT_FAILED'
  | 'PAYMENT_UNCONFIRMED'
  | 'STAMP_FAILED';

/** An opted-in cultural site or small business. */
export interface Place {
  id: string;
  name: string;
  neighborhood: string;
  latitude: number;
  longitude: number;
  /** Geofence radius in meters. */
  radiusMeters: number;
  /** Reward in RLUSD used when the agent fails to give a usable proposal. */
  baseReward: number;
  /** Solana collection address for this place's neighborhood. */
  collectionAddress: string;
  imageUrl: string;
}

/** A user's mission submission, after the API layer has validated its shape. */
export interface SubmissionInput {
  /** Client-supplied ID used to ignore duplicate deliveries of one request. */
  requestId: string;
  placeId: string;
  photo: Buffer;
  latitude: number;
  longitude: number;
  /** When the photo was taken, as epoch milliseconds. */
  timestamp: number;
  xrplAddress: string;
  solanaAddress: string;
  caption?: string;
}

/** The final record of one submission. */
export interface DecisionResult {
  decisionId: string;
  status: DecisionStatus;
  /** Plain-language reasons, mainly for blocked or rejected outcomes. */
  reasons: string[];
  /** What the agent proposed, if the pipeline got that far. */
  proposal?: AgentProposal;
  /** Version of the policy rules that judged the proposal. */
  policyVersion?: string;
  /** Payment hash. Also set when the ledger rejected the payment or it is
      still unconfirmed, so it can be found on the explorer. */
  xrplTxHash?: string;
  /** Ledger result code when XRPL rejected the payment. */
  xrplResultCode?: string;
  solanaAssetAddress?: string;
  solanaSignature?: string;
  /** The stamp's position among stamps for its place, from 1. */
  stampSerial?: number;
  /** Rarity tier picked by the stamp's serial, e.g. "Legendary". */
  stampTier?: string;
  /** True when payment succeeded but the stamp mint failed and was queued. */
  stampFailed: boolean;
}
