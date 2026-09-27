/**Individual policy rules.

Each rule returns a plain-language violation message, or undefined when the
rule passes. Money is compared in whole cents so floating point noise such as
0.1 + 0.2 cannot push a valid total over a cap.
*/

export const MAX_PER_TASK = 5;
export const MAX_PER_DAY = 10;
export const MAX_DECIMAL_PLACES = 2;

/** Convert an RLUSD amount to whole cents, absorbing float noise. */
export function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Amount must be a real number greater than 0 and at most the per-task cap.

Args:
    amount (number): The proposed payout in RLUSD.
    maxPerTask (number): The per-task cap in RLUSD. Defaults to MAX_PER_TASK.

Returns:
    string | undefined: The violation, or undefined if the amount is allowed.
*/
export function checkAmountBounds(amount: number, maxPerTask: number = MAX_PER_TASK): string | undefined {
  if (!Number.isFinite(amount)) {
    return `amount is not a valid number: got ${amount}`;
  }
  if (amount <= 0) {
    return `amount must be greater than 0: asked for ${amount}`;
  }
  if (toCents(amount) > toCents(maxPerTask)) {
    return `per-task cap: asked for ${amount}, max is ${maxPerTask}`;
  }
  return undefined;
}

/** Amount may have at most two decimal places. */
export function checkDecimalPlaces(amount: number): string | undefined {
  const cents = amount * 100;
  if (Math.abs(cents - Math.round(cents)) > 1e-6) {
    return `amount has more than ${MAX_DECIMAL_PLACES} decimal places: ${amount}`;
  }
  return undefined;
}

/** Today's total plus this payout must stay within the daily cap.

Args:
    amount (number): The proposed payout in RLUSD.
    dailyTotal (number): RLUSD already paid to this wallet today.
    maxPerDay (number): The daily cap in RLUSD. Defaults to MAX_PER_DAY.

Returns:
    string | undefined: The violation, or undefined if the total stays in bounds.
*/
export function checkDailyCap(
  amount: number,
  dailyTotal: number,
  maxPerDay: number = MAX_PER_DAY
): string | undefined {
  if (toCents(dailyTotal) + toCents(amount) > toCents(maxPerDay)) {
    return (
      `daily cap: already paid ${dailyTotal} today, asked for ${amount}, ` +
      `max is ${maxPerDay} per day`
    );
  }
  return undefined;
}

/** The payout must go to the wallet the user submitted, never anyone else. */
export function checkRecipient(recipient: string, submitter: string): string | undefined {
  if (recipient !== submitter) {
    return `recipient mismatch: proposal pays ${recipient}, submitted wallet is ${submitter}`;
  }
  return undefined;
}

/** The place must be on the allowlist. */
export function checkPlaceAllowed(placeId: string, allowedPlaceIds: string[]): string | undefined {
  if (!allowedPlaceIds.includes(placeId)) {
    return `place not allowed: ${placeId} is not on the allowlist`;
  }
  return undefined;
}
