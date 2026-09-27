/**Submission orchestrator.

Runs one submission through the pipeline in a fixed order: duplicate check,
Sentinel, photo check, pending claim, agent, policy, XRPL payment, Solana
stamp, save. The photo check runs only when a checker is configured.
Money moves only after every earlier gate passes, and a payment is never
repeated because a stamp mint failed: the mint is queued for retry instead.

A payment that is submitted but not yet confirmed is never treated as
failed, since it may still land. The submission is saved as
PAYMENT_UNCONFIRMED with its claim left pending, and sending the same request
ID again re-checks the ledger and carries on.
*/

import { randomUUID } from 'crypto';
import { PhotoChecker, PhotoCheckResult } from '../agent/photoCheck';
import { AgentProposal, PayoutAgent } from '../agent/types';
import { evaluatePolicy } from '../policy/policy';
import { Sentinel } from '../sentinel/types';
import { MintStampInput, MintStampResult, StampService } from '../solana/types';
import { StorageLayer } from '../storage/types';
import { SendPaymentResult, XrplService } from '../xrpl/types';
import { AuditTrail } from './auditTrail';
import { DecisionResult, Place, SubmissionInput } from './types';

const BYPASS_NOTE = 'policy skipped: test mode bypass';

export interface OrchestratorDeps {
  sentinel: Sentinel;
  /** Checks that the photo shows the place. Unset skips the check. */
  photoChecker?: PhotoChecker;
  agent: PayoutAgent;
  xrpl: XrplService;
  solana: StampService;
  storage: StorageLayer;
  /** Gates the policy bypass. Outside test mode the bypass is ignored. */
  isTestMode: boolean;
  /** REWARD_SCALE. The policy caps shrink by the same factor. Defaults to 1. */
  rewardScale?: number;
  /** Pay RLUSD for cultural visits too. Off (the default) mints the stamp
      and skips the agent, policy, and XRPL steps for cultural places. */
  culturalRewards?: boolean;
  /** How often to re-check an unconfirmed payment before giving up for now. */
  unconfirmedRecheck?: { attempts: number; delayMs: number };
}

export interface RunOptions {
  /** Skip the policy step. Honored only in test mode, to prove the ledger
      layer stops an overspend on its own. */
  bypassPolicy?: boolean;
}

type Outcome = Omit<DecisionResult, 'decisionId' | 'stampFailed'> & { stampFailed?: boolean };

const DEFAULT_RECHECK = { attempts: 3, delayMs: 3000 };

export class Orchestrator {
  constructor(private deps: OrchestratorDeps) {}

  /** Run one submission through the whole pipeline.

  Args:
      input (SubmissionInput): The validated submission.
      options (RunOptions): Test-only switches.

  Returns:
      DecisionResult: The saved outcome. A repeated request ID returns the
          earlier outcome without running anything again, except that an
          earlier PAYMENT_UNCONFIRMED outcome is re-checked and resumed.

  Raises:
      Error: If a dependency throws before any payment was made. The pending
          claim is marked failed first so it does not block the user forever.
  */
  async runSubmission(input: SubmissionInput, options: RunOptions = {}): Promise<DecisionResult> {
    const { sentinel, agent, xrpl, storage } = this.deps;

    const earlier = await storage.getDecisionByRequestId(input.requestId);
    if (earlier && earlier.status === 'PAYMENT_UNCONFIRMED' && earlier.proposal) {
      const notes = earlier.reasons.filter((reason) => reason === BYPASS_NOTE);
      const resumed = new AuditTrail();
      resumed.add('orchestrator', true, 'repeat request for an unconfirmed payment: checking the ledger again');
      return this.settle(input, earlier.decisionId, earlier.proposal, earlier.policyVersion, notes, resumed);
    }
    if (earlier) {
      return earlier;
    }

    const decisionId = randomUUID();
    const trail = new AuditTrail();

    const place = await storage.getPlace(input.placeId);
    if (!place) {
      trail.add('sentinel', false, `unknown place: ${input.placeId}`);
      return this.save(input, decisionId, {
        status: 'BLOCKED_SENTINEL',
        reasons: [`unknown place: ${input.placeId}`],
      }, trail);
    }

    const verification = await sentinel.verify(input, place);
    if (!verification.ok) {
      trail.addAll('sentinel', false, verification.failures);
      return this.save(input, decisionId, {
        status: 'BLOCKED_SENTINEL',
        reasons: verification.failures,
      }, trail);
    }
    trail.add('sentinel', true, 'location, freshness, replay, and once-per-place checks passed');

    if (this.deps.photoChecker) {
      const photoCheck = await this.checkPhoto(this.deps.photoChecker, input, place);
      trail.add('photo', photoCheck.passed, photoCheck.message);
      if (!photoCheck.passed) {
        return this.save(input, decisionId, {
          status: 'BLOCKED_PHOTO',
          reasons: [photoCheck.message],
        }, trail);
      }
    }

    await storage.markClaimPending({
      decisionId,
      xrplAddress: input.xrplAddress,
      solanaAddress: input.solanaAddress,
      placeId: input.placeId,
    });
    trail.add('claim', true, 'claim marked pending');

    if (place.kind === 'cultural' && !this.deps.culturalRewards) {
      trail.add('agent', true, 'cultural visit: stamp only, no RLUSD reward is proposed or paid');
      await storage.updateClaimStatus(decisionId, 'paid');
      return this.stamp(input, decisionId, [], trail, {});
    }

    const bypass = options.bypassPolicy === true && this.deps.isTestMode;
    const notes = bypass ? [BYPASS_NOTE] : [];

    let proposal: AgentProposal;
    let policyVersion: string | undefined;
    try {
      proposal = await agent.propose({
        place,
        xrplAddress: input.xrplAddress,
        caption: input.caption,
      });
      trail.add('agent', true, `proposed ${proposal.amount} RLUSD to ${proposal.recipient}: ${proposal.reason}`);

      if (bypass) {
        trail.add('policy', true, 'skipped: test mode bypass');
      } else {
        const [allowedPlaceIds, storedTotal, ledgerTotal] = await Promise.all([
          storage.listPlaceIds(),
          storage.getDailyTotal(input.xrplAddress),
          xrpl.getPaidToday(input.xrplAddress),
        ]);
        const policy = evaluatePolicy(proposal, {
          submitterXrplAddress: input.xrplAddress,
          placeId: input.placeId,
          allowedPlaceIds,
          dailyTotal: Math.max(storedTotal, ledgerTotal),
          capScale: this.deps.rewardScale,
        });
        policyVersion = policy.policyVersion;

        if (!policy.ok) {
          trail.addAll('policy', false, policy.violations);
          await storage.updateClaimStatus(decisionId, 'failed');
          return this.save(input, decisionId, {
            status: 'BLOCKED_POLICY',
            reasons: policy.violations,
            proposal,
            policyVersion,
          }, trail);
        }
        trail.add('policy', true, `policy ${policy.policyVersion}: proposal allowed`);
      }
    } catch (error) {
      await storage.updateClaimStatus(decisionId, 'failed');
      throw error;
    }

    return this.settle(input, decisionId, proposal, policyVersion, notes, trail);
  }

  /** Pay, stamp, and save. Safe to run again for an unconfirmed payment,
      because the XRPL module never pays twice for one decision ID. */
  private async settle(
    input: SubmissionInput,
    decisionId: string,
    proposal: AgentProposal,
    policyVersion: string | undefined,
    notes: string[],
    trail: AuditTrail
  ): Promise<DecisionResult> {
    const { storage } = this.deps;

    const payment = await this.pay(decisionId, proposal);
    if (!payment.ok) {
      const details = {
        proposal,
        policyVersion,
        xrplTxHash: payment.txHash,
        xrplResultCode: payment.resultCode,
      };

      switch (payment.reason) {
        case 'unconfirmed':
          // Leave the claim pending: the payment may still land.
          trail.add('xrpl', false, `payment not confirmed yet: ${payment.error}`);
          return this.save(input, decisionId, {
            status: 'PAYMENT_UNCONFIRMED',
            reasons: [...notes, `payment submitted but not confirmed yet: ${payment.error}`],
            ...details,
          }, trail);
        case 'ledger_rejected':
          trail.add('xrpl', false, `ledger rejected payment: ${payment.resultCode ?? payment.error}`);
          await storage.updateClaimStatus(decisionId, 'failed');
          return this.save(input, decisionId, {
            status: 'REJECTED_BY_LEDGER',
            reasons: [...notes, `ledger rejected payment: ${payment.resultCode ?? payment.error}`],
            ...details,
          }, trail);
        default:
          // network_error and invalid_input: nothing was paid.
          trail.add('xrpl', false, `payment not sent (${payment.reason}): ${payment.error}`);
          await storage.updateClaimStatus(decisionId, 'failed');
          return this.save(input, decisionId, {
            status: 'PAYMENT_FAILED',
            reasons: [...notes, `payment not sent (${payment.reason}): ${payment.error}`],
            ...details,
          }, trail);
      }
    }
    trail.add('xrpl', true, `paid ${proposal.amount} RLUSD to ${proposal.recipient}, transaction ${payment.txHash}`);
    await storage.updateClaimStatus(decisionId, 'paid');

    return this.stamp(input, decisionId, notes, trail, { proposal, policyVersion, xrplTxHash: payment.txHash });
  }

  /** Mint the visit's stamp and save the decision. A failed mint is queued
      for retry and saved as STAMP_FAILED.

  Args:
      input (SubmissionInput): The submission being settled.
      decisionId (string): The decision's ID.
      notes (string[]): Reasons to carry on the saved decision.
      trail (AuditTrail): History to save with the decision.
      paid (object): proposal, policyVersion, and xrplTxHash of the payment
          for this visit. Empty for a stamp-only cultural visit.

  Returns:
      DecisionResult: The saved decision, OK or STAMP_FAILED.
  */
  private async stamp(
    input: SubmissionInput,
    decisionId: string,
    notes: string[],
    trail: AuditTrail,
    paid: { proposal?: AgentProposal; policyVersion?: string; xrplTxHash?: string }
  ): Promise<DecisionResult> {
    const { solana, storage } = this.deps;

    const mintInput: MintStampInput = {
      decisionId,
      placeId: input.placeId,
      userSolanaAddress: input.solanaAddress,
      xrplTxHash: paid.xrplTxHash ?? '',
    };
    let mint: MintStampResult;
    try {
      mint = await solana.mintStamp(mintInput);
    } catch (error) {
      mint = { ok: false, error: error instanceof Error ? error.message : String(error) };
    }

    if (!mint.ok) {
      trail.add('solana', false, `stamp mint failed, queued for retry: ${mint.error}`);
      await storage.queueStampRetry(mintInput);
      return this.save(input, decisionId, {
        status: 'STAMP_FAILED',
        reasons: [...notes, `stamp mint failed, queued for retry: ${mint.error}`],
        ...paid,
        stampFailed: true,
      }, trail);
    }

    trail.add('solana', true, `stamp minted: ${mint.assetAddress}`);
    return this.save(input, decisionId, {
      status: 'OK',
      reasons: notes,
      ...paid,
      solanaAssetAddress: mint.assetAddress,
      solanaSignature: mint.signature,
      stampSerial: mint.serial,
      stampTier: mint.tier,
    }, trail);
  }

  /** Run the photo check, treating a throw as a blocked result.

  Args:
      checker (PhotoChecker): The configured photo checker.
      input (SubmissionInput): The submission, for its photo.
      place (Place): The place being claimed.

  Returns:
      PhotoCheckResult: The checker's result, or a blocked one if it threw.
  */
  private async checkPhoto(checker: PhotoChecker, input: SubmissionInput, place: Place): Promise<PhotoCheckResult> {
    try {
      return await checker.check({ place, photo: input.photo });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { passed: false, message: `photo check: could not check the photo (${message}), take a new photo and try again` };
    }
  }

  /** Send the payment, re-checking a few times while it is unconfirmed.

  A throw is treated as unconfirmed, the cautious reading: we cannot tell
  whether anything was sent, and re-sending the same decision ID is safe. */
  private async pay(decisionId: string, proposal: AgentProposal): Promise<SendPaymentResult> {
    const { attempts, delayMs } = this.deps.unconfirmedRecheck ?? DEFAULT_RECHECK;
    const send = async (): Promise<SendPaymentResult> => {
      try {
        return await this.deps.xrpl.sendPayment({
          decisionId,
          recipient: proposal.recipient,
          amount: proposal.amount,
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, reason: 'unconfirmed', error: `payment call threw: ${message}` };
      }
    };

    let result = await send();
    for (let i = 0; i < attempts && !result.ok && result.reason === 'unconfirmed'; i++) {
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      result = await send();
    }
    return result;
  }

  /** Save the decision, then its step-by-step history. The history goes second
      so every entry has a saved decision to belong to. */
  private async save(
    input: SubmissionInput,
    decisionId: string,
    outcome: Outcome,
    trail: AuditTrail
  ): Promise<DecisionResult> {
    const decision: DecisionResult = { decisionId, stampFailed: false, ...outcome };
    await this.deps.storage.saveDecision(input.requestId, decision);
    await this.deps.storage.recordAuditEvents(decisionId, trail.entries);
    return decision;
  }
}
