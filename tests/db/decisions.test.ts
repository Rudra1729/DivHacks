import fs from 'fs';
import os from 'os';
import path from 'path';
import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { createDecision, getDecision, getMintedStamps, updateDecision } from '../../src/db/decisions';

describe('decisions table', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = openDatabase(':memory:');
  });

  it('creates and reads a decision', () => {
    createDecision(db, 'dec-1', 'apollo-theater', 'PENDING');
    const decision = getDecision(db, 'dec-1');
    expect(decision?.placeId).toBe('apollo-theater');
    expect(decision?.status).toBe('PENDING');
    expect(decision?.reasons).toEqual([]);
    expect(decision?.stampFailed).toBe(false);
  });

  it('updates mutable fields', () => {
    createDecision(db, 'dec-2', 'apollo-theater', 'PENDING');
    updateDecision(db, 'dec-2', { status: 'PAID', xrplHash: 'ABC123' });
    const decision = getDecision(db, 'dec-2');
    expect(decision?.status).toBe('PAID');
    expect(decision?.xrplHash).toBe('ABC123');
  });

  it('stores the stamp serial and tier', () => {
    createDecision(db, 'dec-3', 'apollo-theater', 'PENDING');
    expect(getDecision(db, 'dec-3')).toMatchObject({ stampSerial: null, stampTier: null });

    updateDecision(db, 'dec-3', { stampSerial: 7, stampTier: 'Legendary' });
    expect(getDecision(db, 'dec-3')).toMatchObject({ stampSerial: 7, stampTier: 'Legendary' });
  });

  it('lists only decisions that recorded a minted stamp, oldest first', () => {
    createDecision(db, 'dec-a', 'apollo-theater', 'OK');
    updateDecision(db, 'dec-a', {
      solanaAddress: 'wallet-1', solanaAsset: 'fake-asset-1', xrplHash: 'HASH', stampSerial: 1, stampTier: 'Legendary',
    });
    createDecision(db, 'dec-b', 'apollo-theater', 'STAMP_FAILED');
    updateDecision(db, 'dec-b', { solanaAddress: 'wallet-2' });
    createDecision(db, 'dec-c', 'mudd-building', 'OK');
    updateDecision(db, 'dec-c', { solanaAddress: 'wallet-1', solanaAsset: 'fake-asset-2', stampSerial: 1, stampTier: 'Legendary' });

    expect(getMintedStamps(db)).toEqual([
      { decisionId: 'dec-a', placeId: 'apollo-theater', owner: 'wallet-1', assetAddress: 'fake-asset-1', xrplTxHash: 'HASH', serial: 1, tier: 'Legendary' },
      { decisionId: 'dec-c', placeId: 'mudd-building', owner: 'wallet-1', assetAddress: 'fake-asset-2', xrplTxHash: '', serial: 1, tier: 'Legendary' },
    ]);
  });

  it('returns undefined for a missing decision', () => {
    expect(getDecision(db, 'missing')).toBeUndefined();
  });
});

describe('opening an older database', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'webpass-db-'));
  const dbPath = path.join(dir, 'old.sqlite');

  afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('adds the stamp serial and tier columns without losing rows', () => {
    const old = new Database(dbPath);
    old.exec(`CREATE TABLE decisions (
      id TEXT PRIMARY KEY, request_id TEXT UNIQUE, place_id TEXT, xrpl_address TEXT,
      solana_address TEXT, amount REAL, status TEXT NOT NULL, reasons TEXT NOT NULL DEFAULT '[]',
      grok_proposal TEXT, policy_version TEXT, xrpl_hash TEXT, xrpl_result TEXT,
      solana_asset TEXT, solana_signature TEXT, stamp_failed INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    )`);
    old.prepare("INSERT INTO decisions (id, request_id, status) VALUES ('old-1', 'old-1', 'OK')").run();
    old.close();

    const db = openDatabase(dbPath);
    updateDecision(db, 'old-1', { stampSerial: 3, stampTier: 'Legendary' });
    expect(getDecision(db, 'old-1')).toMatchObject({ status: 'OK', stampSerial: 3, stampTier: 'Legendary' });
    db.close();
  });
});
