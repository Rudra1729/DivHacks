/**Data access for the decisions table.

The decision ID is the shared key across SQLite, the XRPL payment memo,
and the Solana stamp metadata. requestId is the client-supplied idempotency
key the orchestrator uses to avoid re-running a retried request.
*/

import Database from 'better-sqlite3';

export interface Decision {
  id: string;
  requestId: string;
  placeId: string | null;
  xrplAddress: string | null;
  solanaAddress: string | null;
  amount: number | null;
  status: string;
  reasons: string[];
  grokProposal?: string | null;
  policyVersion?: string | null;
  xrplHash?: string | null;
  xrplResult?: string | null;
  solanaAsset?: string | null;
  solanaSignature?: string | null;
  stampSerial?: number | null;
  stampTier?: string | null;
  stampFailed: boolean;
  createdAt: string;
}

interface DecisionRow {
  id: string;
  request_id: string;
  place_id: string | null;
  xrpl_address: string | null;
  solana_address: string | null;
  amount: number | null;
  status: string;
  reasons: string;
  grok_proposal: string | null;
  policy_version: string | null;
  xrpl_hash: string | null;
  xrpl_result: string | null;
  solana_asset: string | null;
  solana_signature: string | null;
  stamp_serial: number | null;
  stamp_tier: string | null;
  stamp_failed: number;
  created_at: string;
}

function fromRow(row: DecisionRow): Decision {
  return {
    id: row.id,
    requestId: row.request_id,
    placeId: row.place_id,
    xrplAddress: row.xrpl_address,
    solanaAddress: row.solana_address,
    amount: row.amount,
    status: row.status,
    reasons: JSON.parse(row.reasons),
    grokProposal: row.grok_proposal,
    policyVersion: row.policy_version,
    xrplHash: row.xrpl_hash,
    xrplResult: row.xrpl_result,
    solanaAsset: row.solana_asset,
    solanaSignature: row.solana_signature,
    stampSerial: row.stamp_serial,
    stampTier: row.stamp_tier,
    stampFailed: Boolean(row.stamp_failed),
    createdAt: row.created_at,
  };
}

export interface UpsertDecisionInput {
  id: string;
  requestId: string;
  placeId: string | null;
  xrplAddress?: string | null;
  solanaAddress?: string | null;
  amount?: number | null;
  status: string;
  reasons?: string[];
  grokProposal?: string | null;
  policyVersion?: string | null;
  xrplHash?: string | null;
  xrplResult?: string | null;
  solanaAsset?: string | null;
  solanaSignature?: string | null;
  stampSerial?: number | null;
  stampTier?: string | null;
  stampFailed?: boolean;
}

/** Create or fully replace a decision row.

Args:
    db (Database.Database): Open database handle.
    input (UpsertDecisionInput): The decision's full field set.

Returns:
    Decision: The saved decision.
*/
export function upsertDecision(db: Database.Database, input: UpsertDecisionInput): Decision {
  db.prepare(
    `INSERT INTO decisions (
       id, request_id, place_id, xrpl_address, solana_address, amount, status, reasons,
       grok_proposal, policy_version, xrpl_hash, xrpl_result, solana_asset, solana_signature,
       stamp_serial, stamp_tier, stamp_failed
     ) VALUES (
       @id, @requestId, @placeId, @xrplAddress, @solanaAddress, @amount, @status, @reasons,
       @grokProposal, @policyVersion, @xrplHash, @xrplResult, @solanaAsset, @solanaSignature,
       @stampSerial, @stampTier, @stampFailed
     )
     ON CONFLICT(id) DO UPDATE SET
       place_id = COALESCE(excluded.place_id, decisions.place_id),
       xrpl_address = COALESCE(excluded.xrpl_address, decisions.xrpl_address),
       solana_address = COALESCE(excluded.solana_address, decisions.solana_address),
       amount = COALESCE(excluded.amount, decisions.amount),
       status = excluded.status,
       reasons = excluded.reasons,
       grok_proposal = excluded.grok_proposal,
       policy_version = excluded.policy_version,
       xrpl_hash = excluded.xrpl_hash,
       xrpl_result = excluded.xrpl_result,
       solana_asset = excluded.solana_asset,
       solana_signature = excluded.solana_signature,
       stamp_serial = excluded.stamp_serial,
       stamp_tier = excluded.stamp_tier,
       stamp_failed = excluded.stamp_failed`
  ).run({
    id: input.id,
    requestId: input.requestId,
    placeId: input.placeId,
    xrplAddress: input.xrplAddress ?? null,
    solanaAddress: input.solanaAddress ?? null,
    amount: input.amount ?? null,
    status: input.status,
    reasons: JSON.stringify(input.reasons ?? []),
    grokProposal: input.grokProposal ?? null,
    policyVersion: input.policyVersion ?? null,
    xrplHash: input.xrplHash ?? null,
    xrplResult: input.xrplResult ?? null,
    solanaAsset: input.solanaAsset ?? null,
    solanaSignature: input.solanaSignature ?? null,
    stampSerial: input.stampSerial ?? null,
    stampTier: input.stampTier ?? null,
    stampFailed: input.stampFailed ? 1 : 0,
  });
  return getDecision(db, input.id) as Decision;
}

/** Create a new decision row with an initial status. Convenience wrapper
around upsertDecision for callers that don't have the full orchestrator
shape yet (tests, manual inspection).

Args:
    db (Database.Database): Open database handle.
    id (string): The decision ID.
    placeId (string): The place this decision is for.
    status (string): Initial status, e.g. "PENDING".
    reasons (string[]): Reasons recorded so far, if any.

Returns:
    Decision: The created decision.
*/
export function createDecision(
  db: Database.Database,
  id: string,
  placeId: string,
  status: string,
  reasons: string[] = []
): Decision {
  return upsertDecision(db, { id, requestId: id, placeId, status, reasons });
}

/** Fetch a decision by ID.

Args:
    db (Database.Database): Open database handle.
    id (string): The decision ID.

Returns:
    Decision | undefined: The decision, or undefined if not found.
*/
export function getDecision(db: Database.Database, id: string): Decision | undefined {
  const row = db.prepare('SELECT * FROM decisions WHERE id = ?').get(id) as
    | DecisionRow
    | undefined;
  return row ? fromRow(row) : undefined;
}

/** Fetch a decision by its client-supplied request ID.

Args:
    db (Database.Database): Open database handle.
    requestId (string): The idempotency key supplied with the submission.

Returns:
    Decision | undefined: The decision, or undefined if this request hasn't been handled.
*/
export function getDecisionByRequestId(db: Database.Database, requestId: string): Decision | undefined {
  const row = db.prepare('SELECT * FROM decisions WHERE request_id = ?').get(requestId) as
    | DecisionRow
    | undefined;
  return row ? fromRow(row) : undefined;
}

/** Highest stamp serial recorded for a place.

Args:
    db (Database.Database): Open database handle.
    placeId (string): The place to check.

Returns:
    number: The highest serial saved on a decision for the place, 0 if none.
*/
export function getHighestStampSerial(db: Database.Database, placeId: string): number {
  const row = db
    .prepare('SELECT COALESCE(MAX(stamp_serial), 0) AS highest FROM decisions WHERE place_id = ?')
    .get(placeId) as { highest: number };
  return row.highest;
}

/** Sum of RLUSD paid to an address on the current UTC calendar day.

Counts decisions that paid or may still pay: OK, STAMP_FAILED (a failed mint
does not undo the payment), and PAYMENT_UNCONFIRMED (submitted but not yet
confirmed, so it may still land and must count toward the cap). Rejected and
failed payments and blocked decisions are ignored.

Args:
    db (Database.Database): Open database handle.
    xrplAddress (string): The address to total.

Returns:
    number: Total RLUSD paid today (UTC), 0 if none.
*/
export function getDailyTotalUtc(db: Database.Database, xrplAddress: string): number {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM decisions
       WHERE xrpl_address = @xrplAddress
         AND status IN ('OK', 'STAMP_FAILED', 'PAYMENT_UNCONFIRMED')
         AND date(created_at) = date('now')`
    )
    .get({ xrplAddress }) as { total: number };
  return row.total;
}

/** List an address's decisions that moved RLUSD, newest first.

Used for a wallet's transaction history: only decisions with an amount
attached (a payment was attempted) are included, regardless of whether
the payment ultimately succeeded.

Args:
    db (Database.Database): Open database handle.
    xrplAddress (string): The address to list transactions for.

Returns:
    Decision[]: Matching decisions, newest first.
*/
export function getDecisionsByXrplAddress(db: Database.Database, xrplAddress: string): Decision[] {
  const rows = db
    .prepare(
      `SELECT * FROM decisions
       WHERE xrpl_address = @xrplAddress AND amount IS NOT NULL
       ORDER BY created_at DESC`
    )
    .all({ xrplAddress }) as DecisionRow[];
  return rows.map(fromRow);
}

/** Update mutable fields on an existing decision.

Args:
    db (Database.Database): Open database handle.
    id (string): The decision ID.
    fields (Partial<Decision>): Fields to update.
*/
export function updateDecision(
  db: Database.Database,
  id: string,
  fields: Partial<Omit<Decision, 'id' | 'requestId' | 'createdAt'>>
): void {
  const columns: string[] = [];
  const params: Record<string, unknown> = { id };

  if (fields.placeId !== undefined) {
    columns.push('place_id = @placeId');
    params.placeId = fields.placeId;
  }
  if (fields.xrplAddress !== undefined) {
    columns.push('xrpl_address = @xrplAddress');
    params.xrplAddress = fields.xrplAddress;
  }
  if (fields.solanaAddress !== undefined) {
    columns.push('solana_address = @solanaAddress');
    params.solanaAddress = fields.solanaAddress;
  }
  if (fields.amount !== undefined) {
    columns.push('amount = @amount');
    params.amount = fields.amount;
  }
  if (fields.status !== undefined) {
    columns.push('status = @status');
    params.status = fields.status;
  }
  if (fields.reasons !== undefined) {
    columns.push('reasons = @reasons');
    params.reasons = JSON.stringify(fields.reasons);
  }
  if (fields.grokProposal !== undefined) {
    columns.push('grok_proposal = @grokProposal');
    params.grokProposal = fields.grokProposal;
  }
  if (fields.policyVersion !== undefined) {
    columns.push('policy_version = @policyVersion');
    params.policyVersion = fields.policyVersion;
  }
  if (fields.xrplHash !== undefined) {
    columns.push('xrpl_hash = @xrplHash');
    params.xrplHash = fields.xrplHash;
  }
  if (fields.xrplResult !== undefined) {
    columns.push('xrpl_result = @xrplResult');
    params.xrplResult = fields.xrplResult;
  }
  if (fields.solanaAsset !== undefined) {
    columns.push('solana_asset = @solanaAsset');
    params.solanaAsset = fields.solanaAsset;
  }
  if (fields.solanaSignature !== undefined) {
    columns.push('solana_signature = @solanaSignature');
    params.solanaSignature = fields.solanaSignature;
  }
  if (fields.stampSerial !== undefined) {
    columns.push('stamp_serial = @stampSerial');
    params.stampSerial = fields.stampSerial;
  }
  if (fields.stampTier !== undefined) {
    columns.push('stamp_tier = @stampTier');
    params.stampTier = fields.stampTier;
  }
  if (fields.stampFailed !== undefined) {
    columns.push('stamp_failed = @stampFailed');
    params.stampFailed = fields.stampFailed ? 1 : 0;
  }

  if (columns.length === 0) {
    return;
  }

  db.prepare(`UPDATE decisions SET ${columns.join(', ')} WHERE id = @id`).run(params);
}
