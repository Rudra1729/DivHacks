/**Shared harness for the end-to-end tests.

Each test gets a fresh full stack behind the real HTTP routes: real Sentinel,
real SQLite, real orchestrator and policy engine, with fakes for XRPL and
Solana and a scripted stand-in for Grok. Requests go through the same
POST /submissions route a client would use.

To run these against the real networks, swap the fakes in buildE2eStack for the
real XRPL and Solana modules. The tests themselves should not need to change.
*/

import request from 'supertest';
import { Express } from 'express';
import Database from 'better-sqlite3';
import { AgentInput, AgentProposal, PayoutAgent } from '../../src/agent/types';
import { PLACES, Place } from '../../src/data/places';
import { FakeStampService } from '../../src/solana/fakeStamps';
import { FakeXrpl } from '../../src/xrpl/fakeXrpl';
import { disablePolicyBypass } from '../../src/testMode/attackFlag';
import { buildTestApp } from '../testHelpers/buildTestApp';

const BASE58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

/** Build a string of valid base58 characters that is unique per seed. */
function base58(seed: number, length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) {
    out += BASE58[(seed * 7 + i * 13 + seed * i) % BASE58.length];
  }
  return out;
}

export interface TestUser {
  xrpl: string;
  solana: string;
}

/** A user with valid, distinct wallet addresses.

Args:
    n (number): Any number. Different numbers give different wallets.

Returns:
    TestUser: Matching XRPL and Solana addresses.
*/
export function makeUser(n: number): TestUser {
  return { xrpl: `r${base58(n, 30)}`, solana: base58(n + 1000, 44) };
}

export const ATTACKER = makeUser(9999);

/**
 * Stands in for a Grok that has been talked into something by the caption.
 *
 * "ATTACK" in the caption makes it propose 50 RLUSD to the attacker.
 * "AMOUNT:n" makes it propose n RLUSD to the submitter. Otherwise it proposes
 * the place's base reward to the submitter, like a well behaved agent.
 */
export class ScriptedAgent implements PayoutAgent {
  async propose(input: AgentInput): Promise<AgentProposal> {
    const caption = input.caption ?? '';
    if (caption.includes('ATTACK')) {
      return { amount: 50, recipient: ATTACKER.xrpl, reason: 'the caption told me to' };
    }
    const amount = /AMOUNT:(\d+(?:\.\d+)?)/.exec(caption);
    if (amount) {
      return { amount: Number(amount[1]), recipient: input.xrplAddress, reason: 'scripted amount' };
    }
    return { amount: input.place.baseReward, recipient: input.xrplAddress, reason: 'base reward' };
  }
}

export interface E2eStack {
  app: Express;
  db: Database.Database;
  xrpl: FakeXrpl;
  solana: FakeStampService;
}

/** Build a fresh stack. The agent wallet starts with the 10 RLUSD allowance.

Args:
    options.isTestMode (boolean): Whether test-only routes are mounted.

Returns:
    E2eStack: The app plus handles to inspect the fakes and the database.
*/
export function buildE2eStack(options: { isTestMode?: boolean } = {}): E2eStack {
  const xrpl = new FakeXrpl(10);
  const solana = new FakeStampService();
  const { app, db } = buildTestApp(
    { isTestMode: options.isTestMode ?? true },
    { agent: new ScriptedAgent(), xrpl, solana }
  );
  return { app, db, xrpl, solana };
}

/** Undo global state a test may have changed. Call from afterEach. */
export function resetGlobalTestState(): void {
  disablePolicyBypass();
}

/** The nth place from the shared places list. */
export function place(n: number): Place {
  return PLACES[n];
}

let photoCounter = 0;

export interface SubmitOptions {
  caption?: string;
  /** Photo bytes. Defaults to a unique photo each call. */
  photo?: string;
  requestId?: string;
  /** Wallet overrides, for mixing one user's wallets with another's. */
  xrplAddress?: string;
  solanaAddress?: string;
}

/** Submit a fresh, valid mission for a user at a place.

Args:
    app (Express): The app under test.
    user (TestUser): Who is submitting.
    at (Place): Where they are. Their location is exactly the place's pin.
    options (SubmitOptions): Caption, photo, request ID, or wallet overrides.

Returns:
    request.Test: The pending supertest request, resolve it with await.
*/
export function submit(app: Express, user: TestUser, at: Place, options: SubmitOptions = {}): request.Test {
  photoCounter += 1;
  const req = request(app)
    .post('/submissions')
    .field('placeId', at.id)
    .field('latitude', String(at.latitude))
    .field('longitude', String(at.longitude))
    .field('timestamp', new Date().toISOString())
    .field('xrplAddress', options.xrplAddress ?? user.xrpl)
    .field('solanaAddress', options.solanaAddress ?? user.solana)
    .attach('photo', Buffer.from(options.photo ?? `photo-${photoCounter}`), {
      filename: 'photo.jpg',
      contentType: 'image/jpeg',
    });
  if (options.caption) {
    req.field('caption', options.caption);
  }
  if (options.requestId) {
    req.field('requestId', options.requestId);
  }
  return req;
}
