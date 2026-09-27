/**Submission orchestrator.

Runs one submission through the pipeline in a fixed order: duplicate check,
Sentinel, pending claim, agent, policy, XRPL payment, Solana stamp, save.
Money moves only after every earlier gate passes, and a payment is never
repeated because a stamp mint failed: the mint is queued for retry instead.
*/

import { randomUUID } from 'crypto';
import { AgentProposal, PayoutAgent } from '../agent/types';
import { evaluatePolicy } from '../policy/policy';
import { Sentinel } from '../sentinel/types';
import { MintStampInput, MintStampResult, StampService } from '../solana/types';
import { StorageLayer } from '../storage/types';
import { XrplClient } from '../xrpl/types';
import { DecisionResult, SubmissionInput } from './types';

export interface OrchestratorDeps {
  sentinel: Sentinel;
  agent: PayoutAgent;
  xrpl: XrplClient;
  solana: StampService;
  storage: StorageLayer;
  /** Gates the policy bypass. Outside test mode the bypass is ignored. */
  isTestMode: boolean;
}

export interface RunOptions {
  /** Skip the policy step. Honored only in test mode, to prove the ledger
      layer stops an overspend on its own. */
  bypassPolicy?: boolean;
}

export class Orchestrator {
  constructor(private deps: OrchestratorDeps) {}

  /** Run one submission through the whole pipeline.

  Args:
      input (SubmissionInput): The validated submission.
      options (RunOptions): Test-only switches.

  Returns:
      DecisionResult: The saved outcome. A repeated request ID returns the
          earlier outcome without running anything again.

  Raises:
      Error: If a dependency throws before any payment was made. The pending
          claim is marked failed first so it does not block the user forever.
  */
  async runSubmission(input: SubmissionInput, options: RunOptions = {}): Promise<DecisionResult> {
    const { sentinel, agent, xrpl, solana, storage } = this.deps;

    const earlier = await storage.getDecisionByRequestId(input.requestId);
    if (earlier) {
      return earlier;
    }

    const decisionId = randomUUID();
    const finish = async (result: Omit<DecisionResult, 'decisionId' | 'stampFailed'> & {
      stampFailed?: boolean;
    }): Promise<DecisionResult> => {
      const decision: DecisionResult = { decisionId, stampFailed: false, ...result };
      await storage.saveDecision(input.requestId, decision);
      return decision;
    };

    const place = await storage.getPlace(input.placeId);
    if (!place) {
      return finish({
        status: 'BLOCKED_SENTINEL',
        reasons: [`unknown place: ${input.placeId}`],
      });
    }

    const verification = await sentinel.verify(input, place);
    if (!verification.ok) {
      return finish({ status: 'BLOCKED_SENTINEL', reasons: verification.failures });
    }

    await storage.markClaimPending({
      decisionId,
      xrplAddress: input.xrplAddress,
      solanaAddress: input.solanaAddress,
      placeId: input.placeId,
    });

    const bypass = options.bypassPolicy === true && this.deps.isTestMode;
    const notes = bypass ? ['policy skipped: test mode bypass'] : [];

    let proposal: AgentProposal;
    let policyVersion: string | undefined;
    try {
      proposal = await agent.propose({
        place,
        xrplAddress: input.xrplAddress,
        caption: input.caption,
      });

      if (!bypass) {
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
        });
        policyVersion = policy.policyVersion;

        if (!policy.ok) {
          await storage.updateClaimStatus(decisionId, 'failed');
          return finish({
            status: 'BLOCKED_POLICY',
            reasons: policy.violations,
            proposal,
            policyVersion,
          });
        }
      }
    } catch (error) {
      await storage.updateClaimStatus(decisionId, 'failed');
      throw error;
    }

    const payment = await xrpl.pay({
      decisionId,
      recipient: proposal.recipient,
      amount: proposal.amount,
    });
    if (!payment.ok) {
      await storage.updateClaimStatus(decisionId, 'failed');
      return finish({
        status: 'REJECTED_BY_LEDGER',
        reasons: [...notes, `ledger rejected payment: ${payment.resultCode}`],
        proposal,
        policyVersion,
        xrplResultCode: payment.resultCode,
      });
    }
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
      await storage.queueStampRetry(mintInput);
      return finish({
        status: 'STAMP_FAILED',
        reasons: [...notes, `stamp mint failed, queued for retry: ${mint.error}`],
        proposal,
        policyVersion,
        xrplTxHash: payment.txHash,
        stampFailed: true,
      });
    }

    return finish({
      status: 'OK',
      reasons: notes,
      proposal,
      policyVersion,
      xrplTxHash: payment.txHash,
      solanaAssetAddress: mint.assetAddress,
      solanaSignature: mint.signature,
    });
  }
}
