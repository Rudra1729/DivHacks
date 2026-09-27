/**Submission orchestrator.

Runs one submission through the pipeline in a fixed order: duplicate check,
solvency, Sentinel, pending claim, agent, policy, XRPL payment, Solana stamp,
save. Money moves only after every earlier gate passes, and a payment is never
repeated because a stamp mint failed: the mint is queued for retry instead.

Solvency runs before Sentinel on purpose. Sentinel records the photo as used
when a submission passes, so a wallet that cannot pay must be caught first,
or a visitor blocked for something that is not their fault could not retry.

A payment that is submitted but not yet confirmed is never treated as
failed, since it may still land. The submission is saved as
PAYMENT_UNCONFIRMED with its claim left pending, and sending the same request
ID again re-checks the ledger and carries on.
*/

import { randomUUID } from 'crypto';
import { AgentProposal, PayoutAgent, PayoutReviewer, ReviewVerdict } from '../agent/types';
import { evaluatePolicy } from '../policy/policy';
import { checkSolvency, rewardFor } from '../solvency/solvency';
import { Sentinel } from '../sentinel/types';
import { MintStampInput, MintStampResult, StampService } from '../solana/types';
import { StorageLayer } from '../storage/types';
import { SendPaymentResult, XrplService } from '../xrpl/types';
import { AuditTrail } from './auditTrail';
import { resolveReview, ReviewOutcome } from './review';
import { DecisionResult, SubmissionInput } from './types';

const BYPASS_NOTE = 'policy skipped: test mode bypass';
const REVIEW_NOTE_PREFIX = 'reviewer lowered the payout';
const DEFAULT_REVIEW_TIMEOUT_MS = 15000;

export interface OrchestratorDeps {
  sentinel: Sentinel;
  agent: PayoutAgent;
  reviewer: PayoutReviewer;
  xrpl: XrplService;
  solana: StampService;
  storage: StorageLayer;
  /** Gates the policy bypass. Outside test mode the bypass is ignored. */
  isTestMode: boolean;
  /** Multiplier on each place's reward, the same one the agent is given.
      Defaults to 1. */
  rewardScale?: number;
  /** How often to re-check an unconfirmed payment before giving up for now. */
  unconfirmedRecheck?: { attempts: number; delayMs: number };
  /** How long the reviewer may take before the payout falls back to the base reward. */
  reviewTimeoutMs?: number;
}

export interface RunOptions {
  /** Skip the policy step. Honored only in test mode, to prove the ledger
      layer stops an overspend on its own. */
  bypassPolicy?: boolean;
  /** Replace the agent's proposal. Honored only in test mode, for the
      forced overspend attack demo. */
  forceProposal?: AgentProposal;
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

  A request that was stopped by the solvency gate is not final: the wallet may
  be topped up a minute later, so sending the same request ID again runs it
  afresh under the same decision ID.
  */
  async runSubmission(input: SubmissionInput, options: RunOptions = {}): Promise<DecisionResult> {
    const { sentinel, agent, xrpl, storage } = this.deps;

    const earlier = await storage.getDecisionByRequestId(input.requestId);
    if (earlier && earlier.status === 'PAYMENT_UNCONFIRMED' && earlier.proposal) {
      const notes = earlier.reasons.filter(
        (reason) => reason === BYPASS_NOTE || reason.startsWith(REVIEW_NOTE_PREFIX)
      );
      const resumed = new AuditTrail();
      resumed.add('orchestrator', true, 'repeat request for an unconfirmed payment: checking the ledger again');
      return this.settle(input, earlier.decisionId, earlier.proposal, earlier.policyVersion, notes, resumed);
    }
    if (earlier && earlier.status !== 'BLOCKED_SOLVENCY') {
      return earlier;
    }

    const decisionId = earlier?.decisionId ?? randomUUID();
    const trail = new AuditTrail();

    const place = await storage.getPlace(input.placeId);
    if (!place) {
      trail.add('sentinel', false, `unknown place: ${input.placeId}`);
      return this.save(input, decisionId, {
        status: 'BLOCKED_SENTINEL',
        reasons: [`unknown place: ${input.placeId}`],
      }, trail);
    }

    const reward = rewardFor(place, this.deps.rewardScale);
    const solvency = await checkSolvency(xrpl, reward);
    if (!solvency.ok) {
      const detail =
        solvency.reason === 'insufficient'
          ? `the agent wallet holds ${solvency.balance} RLUSD, which cannot cover this place's ${solvency.needed} RLUSD reward`
          : `the agent wallet balance could not be read from the ledger (${solvency.error})`;
      trail.add('solvency', false, detail);
      return this.save(input, decisionId, {
        status: 'BLOCKED_SOLVENCY',
        reasons: [
          solvency.reason === 'insufficient'
            ? `the agent wallet holds ${solvency.balance} RLUSD, which cannot cover this place's ${solvency.needed} RLUSD reward, so no reward can be promised right now. ` +
              'Nothing was used up, so try again later.'
            : 'could not read the agent wallet balance from the ledger, so no reward can be promised right now. ' +
              'Nothing was used up, so try again later.',
        ],
      }, trail);
    }
    trail.add('solvency', true, `agent wallet holds ${solvency.balance} RLUSD, enough to cover the ${reward} RLUSD reward`);

    const verification = await sentinel.verify(input, place);
    if (!verification.ok) {
      trail.addAll('sentinel', false, verification.failures);
      return this.save(input, decisionId, {
        status: 'BLOCKED_SENTINEL',
        reasons: verification.failures,
      }, trail);
    }
    trail.add('sentinel', true, 'location, freshness, replay, and once-per-place checks passed');

    await storage.markClaimPending({
      decisionId,
      xrplAddress: input.xrplAddress,
      solanaAddress: input.solanaAddress,
      placeId: input.placeId,
    });
    trail.add('claim', true, 'claim marked pending');

    const bypass = options.bypassPolicy === true && this.deps.isTestMode;
    const notes = bypass ? [BYPASS_NOTE] : [];

    let proposal: AgentProposal;
    let policyVersion: string | undefined;
    let paidTodayByVisitor = 0;
    try {
      if (options.forceProposal && this.deps.isTestMode) {
        proposal = options.forceProposal;
        trail.add('agent', true, `forced test proposal ${proposal.amount} RLUSD to ${proposal.recipient}: ${proposal.reason}`);
      } else {
        proposal = await agent.propose({
          place,
          xrplAddress: input.xrplAddress,
          caption: input.caption,
        });
        trail.add('agent', true, `proposed ${proposal.amount} RLUSD to ${proposal.recipient}: ${proposal.reason}`);
      }

      if (bypass) {
        trail.add('policy', true, 'skipped: test mode bypass');
      } else {
        const [allowedPlaceIds, storedTotal, ledgerTotal] = await Promise.all([
          storage.listPlaceIds(),
          storage.getDailyTotal(input.xrplAddress),
          xrpl.getPaidToday(input.xrplAddress),
        ]);
        paidTodayByVisitor = Math.max(storedTotal, ledgerTotal);
        const policy = evaluatePolicy(proposal, {
          submitterXrplAddress: input.xrplAddress,
          placeId: input.placeId,
          allowedPlaceIds,
          dailyTotal: paidTodayByVisitor,
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

      if (bypass) {
        trail.add('review', true, 'skipped: test mode bypass');
      } else {
        const review = await this.reviewPayout({
          placeName: place.name,
          baseReward: reward,
          proposedAmount: proposal.amount,
          recipientIsSubmitter: proposal.recipient === input.xrplAddress,
          paidTodayByVisitor,
        });
        const decision = resolveReview(proposal.amount, reward, review);
        if (decision.action === 'reject') {
          trail.add('review', false, `reviewer rejected the payout: ${decision.reason}`);
          await storage.updateClaimStatus(decisionId, 'failed');
          return this.save(input, decisionId, {
            status: 'BLOCKED_REVIEW',
            reasons: [`reviewer rejected the payout: ${decision.reason}`],
            proposal,
            policyVersion,
          }, trail);
        }

        trail.add('review', true, decision.message);
        if (decision.note) {
          notes.push(decision.note);
        }
        proposal = { ...proposal, amount: decision.amount };
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
    const { solana, storage } = this.deps;

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

    const mintInput: MintStampInput = {
      decisionId,
      placeId: input.placeId,
      userSolanaAddress: input.solanaAddress,
      xrplTxHash: payment.txHash,
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
        proposal,
        policyVersion,
        xrplTxHash: payment.txHash,
        stampFailed: true,
      }, trail);
    }

    trail.add('solana', true, `stamp minted: ${mint.assetAddress}`);
    return this.save(input, decisionId, {
      status: 'OK',
      reasons: notes,
      proposal,
      policyVersion,
      xrplTxHash: payment.txHash,
      solanaAssetAddress: mint.assetAddress,
      solanaSignature: mint.signature,
      stampSerial: mint.serial,
      stampTier: mint.tier,
    }, trail);
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

  /** Ask the reviewer for a second opinion, with a timeout and safe fallback. */
  private async reviewPayout(input: Parameters<PayoutReviewer['review']>[0]): Promise<ReviewOutcome> {
    const timeoutMs = this.deps.reviewTimeoutMs ?? DEFAULT_REVIEW_TIMEOUT_MS;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<ReviewOutcome>((resolve) => {
      timer = setTimeout(() => resolve({ kind: 'failed', error: 'timed out' }), timeoutMs);
    });

    const call = this.deps.reviewer
      .review(input)
      .then((verdict: unknown): ReviewOutcome => (
        isReviewVerdict(verdict)
          ? { kind: 'verdict', verdict }
          : { kind: 'failed', error: 'unusable answer' }
      ))
      .catch((error): ReviewOutcome => ({
        kind: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }));

    try {
      return await Promise.race([call, timeout]);
    } finally {
      if (timer) {
        clearTimeout(timer);
      }
    }
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

function isReviewVerdict(value: unknown): value is ReviewVerdict {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  const { decision, reason, amount } = value as Record<string, unknown>;
  if (decision !== 'approve' && decision !== 'reduce' && decision !== 'reject') {
    return false;
  }
  if (typeof reason !== 'string') {
    return false;
  }
  return decision !== 'reduce' || typeof amount === 'number';
}
