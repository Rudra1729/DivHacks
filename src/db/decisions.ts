/**Data access for the decisions table.

The decision ID is the shared key across SQLite, the XRPL payment memo,
and the Solana stamp metadata.
*/

import Database from 'better-sqlite3';

export interface Decision {
  id: string;
  status: string;
  reasons: string[];
  grokProposal?: string | null;
  policyVersion?: string | null;
  xrplHash?: string | null;
  xrplResult?: string | null;
  solanaAsset?: string | null;
  solanaSignature?: string | null;
  stampFailed: boolean;
  createdAt: string;
}

interface DecisionRow {
  id: string;
  status: string;
  reasons: string;
  grok_proposal: string | null;
  policy_version: string | null;
  xrpl_hash: string | null;
  xrpl_result: string | null;
  solana_asset: string | null;
  solana_signature: string | null;
  stamp_failed: number;
  created_at: string;
}

function fromRow(row: DecisionRow): Decision {
  return {
    id: row.id,
    status: row.status,
    reasons: JSON.parse(row.reasons),
    grokProposal: row.grok_proposal,
    policyVersion: row.policy_version,
    xrplHash: row.xrpl_hash,
    xrplResult: row.xrpl_result,
    solanaAsset: row.solana_asset,
    solanaSignature: row.solana_signature,
    stampFailed: Boolean(row.stamp_failed),
    createdAt: row.created_at,
  };
}

/** Create a new decision row with an initial status.

Args:
    db (Database.Database): Open database handle.
    id (string): The decision ID.
    status (string): Initial status, e.g. "PENDING".
    reasons (string[]): Reasons recorded so far, if any.

Returns:
    Decision: The created decision.
*/
export function createDecision(
  db: Database.Database,
  id: string,
  status: string,
  reasons: string[] = []
): Decision {
  db.prepare(
    'INSERT INTO decisions (id, status, reasons) VALUES (@id, @status, @reasons)'
  ).run({ id, status, reasons: JSON.stringify(reasons) });
  return getDecision(db, id) as Decision;
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

/** Update mutable fields on an existing decision.

Args:
    db (Database.Database): Open database handle.
    id (string): The decision ID.
    fields (Partial<Decision>): Fields to update.
*/
export function updateDecision(
  db: Database.Database,
  id: string,
  fields: Partial<Omit<Decision, 'id' | 'createdAt'>>
): void {
  const columns: string[] = [];
  const params: Record<string, unknown> = { id };

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
  if (fields.stampFailed !== undefined) {
    columns.push('stamp_failed = @stampFailed');
    params.stampFailed = fields.stampFailed ? 1 : 0;
  }

  if (columns.length === 0) {
    return;
  }

  db.prepare(`UPDATE decisions SET ${columns.join(', ')} WHERE id = @id`).run(params);
}
