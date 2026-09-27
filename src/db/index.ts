/**Opens the SQLite database and applies the schema.*/

import Database from 'better-sqlite3';
import { SCHEMA_SQL } from './schema';

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
  return db;
}
