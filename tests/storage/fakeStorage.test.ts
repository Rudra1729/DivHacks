import { FakeStorage } from '../../src/storage/fakeStorage';
import { DecisionResult, Place } from '../../src/orchestrator/types';

const place: Place = {
  id: 'apollo',
  name: 'Apollo Theater',
  neighborhood: 'Harlem',
  latitude: 40.81,
  longitude: -73.95,
  radiusMeters: 150,
  baseReward: 2,
  collectionAddress: 'collection1',
  imageUrl: 'https://example.com/apollo.png',
};

function paidDecision(recipient: string, amount: number): DecisionResult {
  return {
    decisionId: `d-${recipient}-${amount}`,
    status: 'OK',
    reasons: [],
    proposal: { amount, recipient, reason: 'test' },
    xrplTxHash: 'TX',
    stampFailed: false,
  };
}

describe('FakeStorage', () => {
  it('looks up places and lists their IDs', async () => {
    const storage = new FakeStorage([place]);

    expect(await storage.getPlace('apollo')).toEqual(place);
    expect(await storage.getPlace('missing')).toBeUndefined();
    expect(await storage.listPlaceIds()).toEqual(['apollo']);
  });

  it('returns a saved decision by request ID', async () => {
    const storage = new FakeStorage();
    const decision = paidDecision('rUser', 2);
    await storage.saveDecision('req1', decision);

    expect(await storage.getDecisionByRequestId('req1')).toEqual(decision);
    expect(await storage.getDecisionByRequestId('req2')).toBeUndefined();
  });

  it('adds up only paid decisions for the daily total', async () => {
    const storage = new FakeStorage();
    await storage.saveDecision('r1', paidDecision('rUser', 2));
    await storage.saveDecision('r2', paidDecision('rUser', 3));
    await storage.saveDecision('r3', paidDecision('rOther', 5));
    await storage.saveDecision('r4', {
      decisionId: 'blocked',
      status: 'BLOCKED_POLICY',
      reasons: ['over cap'],
      proposal: { amount: 50, recipient: 'rUser', reason: 'test' },
      stampFailed: false,
    });

    expect(await storage.getDailyTotal('rUser')).toBe(5);
    expect(await storage.getDailyTotal('nobody')).toBe(0);
  });

  it('counts unconfirmed payments toward the daily total but not rejected ones', async () => {
    const storage = new FakeStorage();
    const base = { reasons: [], stampFailed: false, xrplTxHash: 'TX' };
    await storage.saveDecision('r1', {
      ...base,
      decisionId: 'unconfirmed',
      status: 'PAYMENT_UNCONFIRMED',
      proposal: { amount: 2, recipient: 'rUser', reason: 'test' },
    });
    await storage.saveDecision('r2', {
      ...base,
      decisionId: 'rejected',
      status: 'REJECTED_BY_LEDGER',
      proposal: { amount: 4, recipient: 'rUser', reason: 'test' },
    });

    expect(await storage.getDailyTotal('rUser')).toBe(2);
  });

  it('tracks claim status changes', async () => {
    const storage = new FakeStorage();
    await storage.markClaimPending({
      decisionId: 'd1',
      xrplAddress: 'rUser',
      solanaAddress: 'solUser',
      placeId: 'apollo',
    });
    expect(storage.getClaims()[0].status).toBe('pending');

    await storage.updateClaimStatus('d1', 'paid');
    expect(storage.getClaims()[0].status).toBe('paid');
  });

  it('records queued stamp retries', async () => {
    const storage = new FakeStorage();
    const input = {
      decisionId: 'd1',
      placeId: 'apollo',
      userSolanaAddress: 'solUser',
      xrplTxHash: 'TX',
    };
    await storage.queueStampRetry(input);

    expect(storage.getStampRetries()).toEqual([input]);
  });
});
