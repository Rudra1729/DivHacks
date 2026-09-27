/**Real SQLite-backed storage layer, implementing the interface the
orchestrator depends on (src/storage/types.ts), replacing FakeStorage.
*/

import Database from 'better-sqlite3';
import { DecisionResult, Place } from '../orchestrator/types';
import { AuditEntry, ClaimInput, ClaimStatus, StorageLayer } from './types';
import { MintStampInput } from '../solana/types';
import { getAllPlaces, getPlaceById } from '../data/places';
import {
  Decision,
  getDailyTotalUtc,
  getDecisionByRequestId as dbGetDecisionByRequestId,
  upsertDecision,
} from '../db/decisions';
import {
  createPendingClaimForDecision,
  getClaimByDecisionId,
  updateClaimStatusByDecisionId,
} from '../db/claims';
import { queueStampRetryWithInput } from '../db/stampRetries';
import { addAuditEvent } from '../db/auditEvents';
import { publishEvent } from '../events/bus';

/** Look up a place in the shared list and convert it to the shape the orchestrator uses.

Args:
    placeId (string): The place's ID.

Returns:
    Place | undefined: The place, or undefined if the ID is unknown.
*/
export function toPlace(placeId: string): Place | undefined {
  const place = getPlaceById(placeId);
  if (!place) {
    return undefined;
  }
  return {
    id: place.id,
    name: place.name,
    neighborhood: place.neighborhood,
    latitude: place.latitude,
    longitude: place.longitude,
    radiusMeters: place.geofenceRadiusMeters,
    baseReward: place.baseRewardRlusd,
    collectionAddress: place.solanaCollectionAddress ?? '',
    imageUrl: place.imageUrl,
  };
}

function toDecisionResult(decision: Decision): DecisionResult {
  return {
    decisionId: decision.id,
    status: decision.status as DecisionResult['status'],
    reasons: decision.reasons,
    proposal: decision.grokProposal ? JSON.parse(decision.grokProposal) : undefined,
    policyVersion: decision.policyVersion ?? undefined,
    xrplTxHash: decision.xrplHash ?? undefined,
    xrplResultCode: decision.xrplResult ?? undefined,
    solanaAssetAddress: decision.solanaAsset ?? undefined,
    solanaSignature: decision.solanaSignature ?? undefined,
    stampSerial: decision.stampSerial ?? undefined,
    stampTier: decision.stampTier ?? undefined,
    stampFailed: decision.stampFailed,
  };
}

export class SqliteStorage implements StorageLayer {
  /** Create the real storage layer.

  Args:
      db (Database.Database): Open, schema-initialized database handle.
  */
  constructor(private db: Database.Database) {}

  async getDecisionByRequestId(requestId: string): Promise<DecisionResult | undefined> {
    const decision = dbGetDecisionByRequestId(this.db, requestId);
    return decision ? toDecisionResult(decision) : undefined;
  }

  async getPlace(placeId: string): Promise<Place | undefined> {
    return toPlace(placeId);
  }

  async listPlaceIds(): Promise<string[]> {
    return getAllPlaces().map((place) => place.id);
  }

  /** RLUSD paid to this address so far on the current UTC calendar day. */
  async getDailyTotal(xrplAddress: string): Promise<number> {
    return getDailyTotalUtc(this.db, xrplAddress);
  }

  async markClaimPending(claim: ClaimInput): Promise<void> {
    createPendingClaimForDecision(this.db, claim.decisionId, claim.placeId, claim.xrplAddress, claim.solanaAddress);
  }

  async updateClaimStatus(decisionId: string, status: ClaimStatus): Promise<void> {
    updateClaimStatusByDecisionId(this.db, decisionId, status);
  }

  async queueStampRetry(input: MintStampInput): Promise<void> {
    queueStampRetryWithInput(this.db, input, 'mint failed, queued for retry');
  }

  /** Save a decision's history and announce each step on the live event stream.

  Args:
      decisionId (string): The saved decision the steps belong to.
      events (AuditEntry[]): The steps, in the order they happened.
  */
  async recordAuditEvents(decisionId: string, events: AuditEntry[]): Promise<void> {
    const insertAll = this.db.transaction((entries: AuditEntry[]) => {
      for (const entry of entries) {
        addAuditEvent(this.db, decisionId, entry.layer, entry.passed, entry.message);
      }
    });
    insertAll(events);

    for (const entry of events) {
      publishEvent({ type: `audit.${entry.layer}`, decisionId, message: entry.message });
    }
  }

  async saveDecision(requestId: string, decision: DecisionResult): Promise<void> {
    // The submitter's placeId/xrplAddress/solanaAddress aren't part of
    // DecisionResult; the claim row (written by markClaimPending, keyed on
    // the same decisionId, before this runs) is the source of truth for
    // them. A decision blocked before Sentinel passed has no claim, so
    // those fields stay null, there was never a submitter to attribute a
    // paid amount to.
    const claim = getClaimByDecisionId(this.db, decision.decisionId);

    upsertDecision(this.db, {
      id: decision.decisionId,
      requestId,
      placeId: claim?.placeId ?? null,
      xrplAddress: claim?.xrplAddress ?? null,
      solanaAddress: claim?.solanaAddress ?? null,
      amount: decision.proposal?.amount ?? null,
      status: decision.status,
      reasons: decision.reasons,
      grokProposal: decision.proposal ? JSON.stringify(decision.proposal) : null,
      policyVersion: decision.policyVersion ?? null,
      xrplHash: decision.xrplTxHash ?? null,
      xrplResult: decision.xrplResultCode ?? null,
      solanaAsset: decision.solanaAssetAddress ?? null,
      solanaSignature: decision.solanaSignature ?? null,
      stampSerial: decision.stampSerial ?? null,
      stampTier: decision.stampTier ?? null,
      stampFailed: decision.stampFailed,
    });
  }
}
