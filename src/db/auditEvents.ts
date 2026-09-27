/**Data access for the audit_events table.

Every check and step in a submission's journey is recorded here, with
which layer ran it, whether it passed, and a human-readable message.
*/

import Database from 'better-sqlite3';

export interface AuditEvent {
  id: number;
  decisionId: string;
  layer: string;
  passed: boolean;
  message: string;
  createdAt: string;
}

interface AuditEventRow {
  id: number;
  decision_id: string;
  layer: string;
  passed: number;
  message: string;
  created_at: string;
}

function fromRow(row: AuditEventRow): AuditEvent {
  return {
    id: row.id,
    decisionId: row.decision_id,
    layer: row.layer,
    passed: Boolean(row.passed),
    message: row.message,
    createdAt: row.created_at,
  };
}

/** Record one audit event for a decision.

Args:
    db (Database.Database): Open database handle.
    decisionId (string): The decision this event belongs to.
    layer (string): Which layer produced the event, e.g. "sentinel".
    passed (boolean): Whether the check passed.
    message (string): Human-readable description of the result.
*/
export function addAuditEvent(
  db: Database.Database,
  decisionId: string,
  layer: string,
  passed: boolean,
  message: string
): void {
  db.prepare(
    'INSERT INTO audit_events (decision_id, layer, passed, message) VALUES (@decisionId, @layer, @passed, @message)'
  ).run({ decisionId, layer, passed: passed ? 1 : 0, message });
}

/** List all audit events for a decision, oldest first.

Args:
    db (Database.Database): Open database handle.
    decisionId (string): The decision to list events for.

Returns:
    AuditEvent[]: The events in the order they were recorded.
*/
export function listAuditEvents(db: Database.Database, decisionId: string): AuditEvent[] {
  const rows = db
    .prepare('SELECT * FROM audit_events WHERE decision_id = ? ORDER BY id ASC')
    .all(decisionId) as AuditEventRow[];
  return rows.map(fromRow);
}
