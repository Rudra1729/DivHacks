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
  verify(input: SubmissionInput, place: Place): Promise<SentinelResult>;
}
