/**SQLite table definitions for the WebPass NYC backend.

Tables mirror the "Data and audit trail" section of the PRD: decisions,
audit events, photo fingerprints, claims, request IDs, and stamp retries.
The decision ID is the shared key linking SQLite, XRPL, and Solana records.
*/

export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  reasons TEXT NOT NULL DEFAULT '[]',
  grok_proposal TEXT,
  policy_version TEXT,
  xrpl_hash TEXT,
  xrpl_result TEXT,
  solana_asset TEXT,
  solana_signature TEXT,
  stamp_failed INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS audit_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  decision_id TEXT NOT NULL,
  layer TEXT NOT NULL,
  passed INTEGER NOT NULL,
  message TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  FOREIGN KEY (decision_id) REFERENCES decisions(id)
);

CREATE TABLE IF NOT EXISTS photo_fingerprints (
  hash TEXT PRIMARY KEY,
  decision_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS claims (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  xrpl_address TEXT NOT NULL,
  solana_address TEXT NOT NULL,
  place_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS request_ids (
  request_id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE TABLE IF NOT EXISTS stamp_retries (
  decision_id TEXT PRIMARY KEY,
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_events_decision_id ON audit_events(decision_id);
CREATE INDEX IF NOT EXISTS idx_claims_place_id ON claims(place_id);
CREATE INDEX IF NOT EXISTS idx_claims_xrpl_address ON claims(xrpl_address);
CREATE INDEX IF NOT EXISTS idx_claims_solana_address ON claims(solana_address);
`;
