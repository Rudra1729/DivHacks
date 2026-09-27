/**Shared types for the live check runner.*/

export type CheckStatus = 'pass' | 'fail' | 'skipped';

/** One yes-or-no statement a check makes, with what was actually seen. */
export interface Assertion {
  description: string;
  passed: boolean;
  actual?: unknown;
}

export interface Link {
  label: string;
  url: string;
}

/** What a check function returns. The runner turns it into a CheckResult. */
export interface CheckOutcome {
  assertions: Assertion[];
  /** Raw data worth keeping: HTTP responses, ledger lookups, balances. */
  evidence: Record<string, unknown>;
  links: Link[];
  /** One sentence for the report. */
  summary: string;
  /** Set when the check could not run, with the reason. */
  skipped?: string;
}

export interface CheckResult {
  id: string;
  title: string;
  proves: string;
  /** Rough cost in test funds, for the report. */
  cost: string;
  status: CheckStatus;
  summary: string;
  assertions: Assertion[];
  evidence: Record<string, unknown>;
  links: Link[];
  durationMs: number;
  error?: string;
}

/** Collects assertions while a check runs. */
export class Assertions {
  readonly list: Assertion[] = [];

  /** Record one statement.

  Args:
      description (string): What should be true, in plain words.
      passed (boolean): Whether it was.
      actual (unknown): What was actually seen, kept as evidence.
  */
  that(description: string, passed: boolean, actual?: unknown): void {
    this.list.push({ description, passed, actual });
  }
}
