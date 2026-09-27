/**Helpers for validating reward amounts and the UTC day boundary.

Shared by the real and fake payment services so both reject the same
inputs and agree on what "today" means.
*/

/** Check that an amount is positive and has at most 2 decimal places.

Args:
    amount (number): Proposed reward.

Returns:
    string | null: A plain-language problem, or null if the amount is fine.
*/
export function amountProblem(amount: number): string | null {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) {
    return `amount must be a number, got ${String(amount)}`;
  }
  if (amount <= 0) {
    return `amount must be above 0, got ${amount}`;
  }
  if (Math.abs(Math.round(amount * 100) - amount * 100) > 1e-9) {
    return `amount must have at most 2 decimals, got ${amount}`;
  }
  return null;
}

/** Format an amount as the decimal string XRPL expects, like "2" or "2.5".

Args:
    amount (number): A valid amount (see amountProblem).

Returns:
    string: The amount rounded to 2 decimals, without trailing zeros.
*/
export function formatAmount(amount: number): string {
  return String(Number(amount.toFixed(2)));
}

/** Start of the current UTC day.

Args:
    now (Date): Current time. Defaults to now.

Returns:
    Date: Midnight UTC of the same day.
*/
export function startOfUtcDay(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}
