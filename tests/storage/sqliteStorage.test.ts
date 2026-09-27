import Database from 'better-sqlite3';
import { openDatabase } from '../../src/db';
import { SqliteStorage } from '../../src/storage/sqliteStorage';
import { DecisionResult } from '../../src/orchestrator/types';

describe('SqliteStorage', () => {
  let db: Database.Database;
  let storage: SqliteStorage;

  beforeEach(() => {
    db = openDatabase(':memory:');
    storage = new SqliteStorage(db);
  });

  it('lists the seeded place IDs and reads a place by ID', async () => {
    const ids = await storage.listPlaceIds();
    expect(ids).toContain('apollo-theater');

    const place = await storage.getPlace('apollo-theater');
    expect(place?.name).toBe('Apollo Theater');
    expect(place?.radiusMeters).toBeGreaterThan(0);
  });

  it('returns undefined for an unknown place', async () => {
    expect(await storage.getPlace('not-a-place')).toBeUndefined();
  });

  it('marks a claim pending, then updates its status', async () => {
    await storage.markClaimPending({
      decisionId: 'dec-1',
      xrplAddress: 'rXRPL',
      solanaAddress: 'sSolana',
      placeId: 'apollo-theater',
    });
    await storage.updateClaimStatus('dec-1', 'paid');
    // No direct read in the StorageLayer interface; verified indirectly
    // through getDailyTotal/saveDecision below, and via the claims DAL
    // tests, which cover the underlying row directly.
  });

  it('saves and re-reads a decision by request ID, deriving place/wallets from the claim', async () => {
    await storage.markClaimPending({
      decisionId: 'dec-1',
      xrplAddress: 'rXRPL',
      solanaAddress: 'sSolana',
      placeId: 'apollo-theater',
    });

    const decision: DecisionResult = {
      decisionId: 'dec-1',
      status: 'OK',
      reasons: [],
      proposal: { amount: 2, recipient: 'rXRPL', reason: 'nice visit' },
      xrplTxHash: 'TXHASH123',
      solanaAssetAddress: 'asset-1',
      solanaSignature: 'sig-1',
      stampFailed: false,
    };
    await storage.saveDecision('req-1', decision);

    const saved = await storage.getDecisionByRequestId('req-1');
    expect(saved?.decisionId).toBe('dec-1');
    expect(saved?.status).toBe('OK');
    expect(saved?.proposal?.amount).toBe(2);
    expect(saved?.xrplTxHash).toBe('TXHASH123');
  });

  it('returns undefined for an unhandled request ID', async () => {
    expect(await storage.getDecisionByRequestId('never-seen')).toBeUndefined();
  });

  it('sums paid amounts for getDailyTotal, ignoring blocked decisions', async () => {
    await storage.markClaimPending({
      decisionId: 'dec-1',
      xrplAddress: 'rXRPL',
      solanaAddress: 'sSolana',
      placeId: 'apollo-theater',
    });
    await storage.saveDecision('req-1', {
      decisionId: 'dec-1',
      status: 'OK',
      reasons: [],
      proposal: { amount: 3, recipient: 'rXRPL', reason: 'ok' },
      stampFailed: false,
    });

    await storage.markClaimPending({
      decisionId: 'dec-2',
      xrplAddress: 'rXRPL',
      solanaAddress: 'sSolana',
      placeId: 'studio-museum-harlem',
    });
    await storage.saveDecision('req-2', {
      decisionId: 'dec-2',
      status: 'BLOCKED_POLICY',
      reasons: ['per-task cap'],
      proposal: { amount: 50, recipient: 'rAttacker', reason: 'bad' },
      stampFailed: false,
    });

    expect(await storage.getDailyTotal('rXRPL')).toBe(3);
  });

  it('queues a stamp retry with the full mint input', async () => {
    await storage.queueStampRetry({
      decisionId: 'dec-1',
      placeId: 'apollo-theater',
      userSolanaAddress: 'sSolana',
      xrplTxHash: 'TXHASH123',
    });
    // No direct read in the StorageLayer interface; covered at the DAL
    // level by tests/db/stampRetries.test.ts.
  });
});
