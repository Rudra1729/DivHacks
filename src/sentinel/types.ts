/**Sentinel verification interface consumed by the orchestrator.

The Sentinel owner builds the real checks (location, freshness, photo
replay, once per place). This shape is an assumption until it is agreed with
them in chat.
*/

import { Place, SubmissionInput } from '../orchestrator/types';

/** Pass, or every failed check reported together in plain words. */
export type SentinelResult =
  | { ok: true }
  | { ok: false; failures: string[] };

export interface Sentinel {
  /** Check a submission.

  Args:
      input (SubmissionInput): The submission.
      place (Place): The place being claimed.
      decisionId (string): The decision this submission will be saved as, so
          anything recorded along the way (such as the photo fingerprint) can be
          traced back to it.

  Returns:
      Promise<SentinelResult>: Pass, or every failed check.
  */
  verify(input: SubmissionInput, place: Place, decisionId?: string): Promise<SentinelResult>;
}
