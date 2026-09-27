/**Solvency check: never promise a reward the agent wallet cannot pay.

The agent wallet's RLUSD balance is read from the validated ledger before a
visitor is told they will be paid. Without this, an empty wallet only shows up
at the very end, after the visitor passed every check, as a ledger rejection.

The check is fail-closed: if the balance cannot be read, nothing is promised.
*/

import { scaleReward } from '../agent/grok';
import { XrplService } from '../xrpl/types';

type BalanceReader = Pick<XrplService, 'getRlusdBalance' | 'getAgentAddress'>;

/** How the check came out.

Failure reasons:
    insufficient: the wallet holds less than the reward.
    unreadable: the balance could not be read, so nothing can be promised.
*/
export type SolvencyResult =
  | { ok: true; balance: number }
  | { ok: false; reason: 'insufficient'; balance: number; needed: number }
  | { ok: false; reason: 'unreadable'; error: string };

/** How long a balance read is reused by the places endpoint. */
export const DEFAULT_BALANCE_TTL_MS = 10_000;

/** The reward a visitor to this place is promised, after the reward scale.

Args:
    place (object): Anything with the place's base reward.
    rewardScale (number): The configured multiplier in (0, 1].

Returns:
    number: The scaled reward in RLUSD, at most 2 decimals, at least one cent.
*/
export function rewardFor(place: { baseReward: number }, rewardScale = 1): number {
  return scaleReward(place.baseReward, rewardScale);
}

/** Whether a balance covers a reward, compared in whole cents.

Cents avoid floating point noise, such as 0.1 + 0.2 being slightly more than 0.3.

Args:
    balance (number): RLUSD the agent wallet holds.
    needed (number): RLUSD the reward requires.

Returns:
    boolean: True if the balance is a usable number and at least the reward.
*/
export function coversReward(balance: number, needed: number): boolean {
  if (!Number.isFinite(balance) || !Number.isFinite(needed) || balance < 0) {
    return false;
  }
  return Math.round(balance * 100) >= Math.round(needed * 100);
}

/** Read the agent wallet balance from the ledger and compare it to a reward.

Never throws: a failed read is reported as unreadable.

Args:
    xrpl (BalanceReader): The XRPL module, or anything that can read a balance.
    needed (number): The reward in RLUSD the visitor would be promised.

Returns:
    Promise<SolvencyResult>: Whether the wallet can cover the reward.
*/
export async function checkSolvency(xrpl: BalanceReader, needed: number): Promise<SolvencyResult> {
  let balance: number;
  try {
    balance = await xrpl.getRlusdBalance(xrpl.getAgentAddress());
  } catch (error) {
    return { ok: false, reason: 'unreadable', error: error instanceof Error ? error.message : String(error) };
  }
  if (typeof balance !== 'number' || Number.isNaN(balance)) {
    return { ok: false, reason: 'unreadable', error: `the ledger returned ${String(balance)} instead of a balance` };
  }
  if (!coversReward(balance, needed)) {
    return { ok: false, reason: 'insufficient', balance, needed };
  }
  return { ok: true, balance };
}

/** Reads the agent wallet balance and remembers it briefly.

Used by the places endpoint, so that many page loads make one ledger read
instead of many. A failed read is remembered for the same time, so a ledger
outage is not hammered either. Requests that arrive during a read share it.
*/
export class AgentBalanceCache {
  private value: number | null = null;
  private readAt = -Infinity;
  private inFlight?: Promise<number | null>;
  private ttlMs: number;
  private now: () => number;

  /** Create the cache.

  Args:
      xrpl (BalanceReader): Where the balance is read from.
      options.ttlMs (number): How long an answer is reused. Defaults to 10 seconds.
      options.now (() => number): Clock, injectable for tests.
  */
  constructor(private xrpl: BalanceReader, options: { ttlMs?: number; now?: () => number } = {}) {
    this.ttlMs = options.ttlMs ?? DEFAULT_BALANCE_TTL_MS;
    this.now = options.now ?? Date.now;
  }

  /** The agent wallet balance, from the cache if it is fresh.

  Returns:
      Promise<number | null>: The balance in RLUSD, or null if it could not be read.
  */
  read(): Promise<number | null> {
    if (this.now() - this.readAt < this.ttlMs) {
      return Promise.resolve(this.value);
    }
    if (!this.inFlight) {
      this.inFlight = this.fetch().finally(() => {
        this.inFlight = undefined;
      });
    }
    return this.inFlight;
  }

  private async fetch(): Promise<number | null> {
    const result = await checkSolvency(this.xrpl, 0);
    this.value = result.ok || result.reason === 'insufficient' ? result.balance : null;
    this.readAt = this.now();
    return this.value;
  }
}
