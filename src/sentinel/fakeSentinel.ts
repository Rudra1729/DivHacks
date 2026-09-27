/**In-memory Sentinel stand-in.

Passes everything unless it was built with failures to report, which lets
tests exercise the blocked-by-Sentinel path.
*/

import { Sentinel, SentinelResult } from './types';

export class FakeSentinel implements Sentinel {
  /** Create the fake Sentinel.

  Args:
      failures (string[]): Failure messages to report. Empty means always pass.
  */
  constructor(private failures: string[] = []) {}

  async verify(): Promise<SentinelResult> {
    if (this.failures.length > 0) {
      return { ok: false, failures: [...this.failures] };
    }
    return { ok: true };
  }
}
