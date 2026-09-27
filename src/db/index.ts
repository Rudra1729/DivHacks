/**Opens the SQLite database and applies the schema.*/

import Database from 'better-sqlite3';
import { ADDED_DECISION_COLUMNS, SCHEMA_SQL } from './schema';

/** Add decision columns that an older database file is missing.

Args:
    db (Database.Database): Open database handle with the decisions table.
*/
function addMissingDecisionColumns(db: Database.Database): void {
  const existing = new Set(
    (db.prepare('PRAGMA table_info(decisions)').all() as Array<{ name: string }>).map((column) => column.name)
  );
  for (const [name, type] of ADDED_DECISION_COLUMNS) {
    if (!existing.has(name)) {
      db.exec(`ALTER TABLE decisions ADD COLUMN ${name} ${type}`);
    }
  }
}

/** Open a SQLite database at the given path and ensure tables exist.

Args:
    dbPath (string): Filesystem path to the SQLite file, or ':memory:'.

Returns:
    Database.Database: An open, schema-initialized database handle.
*/
export function openDatabase(dbPath: string): Database.Database {
  const db = new Database(dbPath);
  db.pragma('journal_mode = WAL');
  db.exec(SCHEMA_SQL);
  addMissingDecisionColumns(db);
  return db;
}
