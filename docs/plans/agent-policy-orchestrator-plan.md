# Implementation Plan: Grok Agent, Policy Engine, Orchestrator, Test Suite

Spec: `docs/specs/agent-policy-orchestrator.md`. Timeline anchors to the
integration rounds and per-person schedule already fixed in `PRD.md`
(Round 1 9:30 PM, Round 2 10:00 PM, Round 3 11:00 PM, Round 4 12:00-4:00 AM).

## Overview

Arundathi's slice runs bottom-up: shared types and in-memory fakes for the
other three modules first (unblocks everything, no team dependency), then
the Grok agent and policy engine (also no team dependency), then the
orchestrator wired to fakes (Round 1), then swap fakes for the real XRPL
module (Round 2, needs Tanish) and real Solana module (Round 3, needs
Rudra, interface already agreed), then the 8 required end-to-end tests on
real networks (Round 4), some of which also need Junaid's Sentinel/storage
pieces (replay, once-per-place, race, Solana-failure retry).

## Architecture Decisions

- Fakes for XRPL/Solana/Storage/Sentinel are built first, behind the same
  interface the real modules will implement, so Round 1 doesn't block on
  anyone else and the swap-in at Round 2/3 is a one-line import change.
- The Solana fake implements the hand-off contract already agreed in
  `CONTRIBUTING.md` exactly, so it's a drop-in for the real module later.
- The XRPL interface is *assumed* (not yet agreed with Tanish) — Task 6
  exists specifically to agree it in chat before wiring the real module,
  per `CONTRIBUTING.md` rule 6.

## Task List

### Phase 0: Foundation (target: 5:00-6:00 PM, no team dependency)

- [ ] **Task 1: Shared decision types**
  - Description: Define the status enum and shared result/input shapes the
    rest of this slice is built on.
  - Acceptance:
    - [ ] `DecisionStatus` covers OK, BLOCKED_SENTINEL, BLOCKED_POLICY,
          REJECTED_BY_LEDGER, STAMP_FAILED.
    - [ ] `DecisionResult` and `SubmissionInput` types compile and are
          exported.
  - Verification: `npm run build`
  - Dependencies: None
  - Files: `src/orchestrator/types.ts`
  - Scope: XS

- [ ] **Task 2a: Fake XRPL + Solana modules**
  - Description: In-memory stand-ins so Round 1 works without real chains.
    Solana fake implements the agreed hand-off contract exactly.
  - Acceptance:
    - [ ] Fake XRPL rejects a payment that would exceed a wallet's fake
          balance (this is what makes the bypass-attack concept testable
          before the real ledger exists).
    - [ ] Fake Solana's `mintStamp`/`hasStampForPlace`/`getStamps` match
          the `CONTRIBUTING.md` contract's signatures exactly.
  - Verification: `npm test -- tests/xrpl tests/solana`
  - Dependencies: Task 1
  - Files: `src/xrpl/types.ts`, `src/xrpl/fakeXrpl.ts`,
    `src/solana/fakeSolana.ts`, `tests/xrpl/fakeXrpl.test.ts`,
    `tests/solana/fakeSolana.test.ts`
  - Scope: M

- [ ] **Task 2b: Fake Storage + Sentinel stand-ins**
  - Description: In-memory stand-ins for Junaid's storage (daily totals,
    claim state) and Sentinel (always-pass) so the orchestrator and policy
    engine can be built and tested independently.
  - Acceptance:
    - [ ] Fake storage supports `getDailyTotal`, `markClaimPending`,
          `saveDecision`.
    - [ ] Fake Sentinel returns a pass result unconditionally.
  - Verification: `npm test -- tests/storage tests/sentinel`
  - Dependencies: Task 1
  - Files: `src/storage/fakeStorage.ts`, `src/sentinel/fakeSentinel.ts`,
    `tests/storage/fakeStorage.test.ts`,
    `tests/sentinel/fakeSentinel.test.ts`
  - Scope: S

### Checkpoint: Foundation
- [ ] `npm test` green for types/fakes
- [ ] `npm run build` clean

### Phase 1: Agent and Policy (target: 6:00-7:00 PM, no team dependency)

- [ ] **Task 3: Grok agent module**
  - Description: Call Grok with place details, base reward, submitter's
    XRPL address, and caption; parse its fixed-format output; fall back to
    the base reward paid to the submitter's own wallet on malformed output
    or API failure.
  - Acceptance:
    - [ ] Valid Grok response parses into `{ amount, recipient, reason }`.
    - [ ] Malformed response (missing/non-numeric field) triggers the
          fallback.
    - [ ] Network/API failure triggers the same fallback.
  - Verification: `npm test -- tests/agent` (Grok HTTP call mocked)
  - Dependencies: Task 1
  - Files: `src/agent/types.ts`, `src/agent/grok.ts`,
    `tests/agent/grok.test.ts`
  - Scope: S

- [ ] **Task 4: Policy engine**
  - Description: Fixed, non-AI rule checks against a Grok proposal:
    amount bounds, daily cap (max of storage and ledger reads), recipient
    match, place allowlist, decimal precision. Every violation reported in
    plain language; policy version logged on every result.
  - Acceptance:
    - [ ] Amount ≤ 0 or > 5 RLUSD rejected with a plain-language message.
    - [ ] Daily total + amount > 10 RLUSD rejected.
    - [ ] Recipient ≠ submitting wallet rejected.
    - [ ] Place not on allowlist rejected.
    - [ ] More than 2 decimal places rejected.
    - [ ] A fully valid proposal returns `ok: true` with a policy version.
  - Verification: `npm test -- tests/policy`
  - Dependencies: Task 1, Task 2b (fake storage for daily-total tests)
  - Files: `src/policy/types.ts`, `src/policy/rules.ts`,
    `src/policy/policy.ts`, `tests/policy/policy.test.ts`
  - Scope: S

### Checkpoint: Agent + Policy
- [ ] `npm test` green for agent + policy
- [ ] Both modules usable standalone, no orchestrator needed yet

### Phase 2: Orchestrator v1, wired to fakes (target: Round 1, 9:30 PM)

- [ ] **Task 5: Orchestrator sequencing**
  - Description: `runSubmission()` runs duplicate-request check → Sentinel
    → mark claim pending → Grok → policy → XRPL pay → Solana mint → save,
    against the fakes from Phase 0. Exposes a function Junaid's API route
    can call directly.
  - Acceptance:
    - [ ] A valid submission returns `status: OK` with a decision ID and
          fake tx/mint references.
    - [ ] A submission with an injected caption asking for 50 RLUSD to an
          attacker address returns `BLOCKED_POLICY`.
    - [ ] A duplicate request ID returns the cached prior result instead
          of re-running the pipeline.
  - Verification: `npm test -- tests/orchestrator`; manually POST a
    submission via `npm run dev` once Junaid's route calls this function,
    confirm a correct JSON result.
  - Dependencies: Tasks 1-4
  - Files: `src/orchestrator/orchestrator.ts`,
    `tests/orchestrator/orchestrator.test.ts`
  - Scope: M

### Checkpoint: Round 1 (9:30 PM)
- [ ] `npm test` green across agent/policy/orchestrator/fakes
- [ ] Orchestrator plugged into Junaid's submit route, returns a correct
      result end to end (still fake XRPL/Solana)
- [ ] Sync with team before Round 2

### Phase 3: Real XRPL swap-in (target: Round 2, 10:00 PM — needs Tanish)

- [ ] **Task 6: Agree and adopt the real XRPL interface**
  - Description: Agree the XRPL module's exported interface with Tanish in
    chat (mirroring the Solana hand-off contract pattern), document it in
    `CONTRIBUTING.md` per rule 6, then point the orchestrator's import at
    the real module instead of the fake.
  - Acceptance:
    - [ ] `CONTRIBUTING.md` has an "XRPL payments hand-off" section,
          agreed by Tanish.
    - [ ] Orchestrator imports the real XRPL module behind the same
          interface; unit tests still use the fake.
  - Verification: `npm test`; manually confirm one real 2 RLUSD payment on
    the XRPL testnet explorer through the full server flow.
  - Dependencies: Task 5; **blocked until Tanish's real XRPL module and
    interface are ready**
  - Files: `CONTRIBUTING.md`, `src/xrpl/types.ts`,
    `src/orchestrator/orchestrator.ts`
  - Scope: S

### Checkpoint: Round 2 (10:00 PM)
- [ ] A real RLUSD payment happens through the server end to end
- [ ] Manually send an amount above the agent's allowance and confirm the
      ledger rejects it (early look at the bypass-test mechanism)

### Phase 4: Real Solana swap-in (target: Round 3, 11:00 PM — needs Rudra)

- [ ] **Task 7: Adopt the real Solana module**
  - Description: Point the orchestrator at Rudra's real Solana module.
    No new agreement needed — the interface is already fixed in
    `CONTRIBUTING.md`.
  - Acceptance:
    - [ ] Orchestrator calls the real `mintStamp`/`hasStampForPlace`.
    - [ ] Payment and stamp share one decision ID end to end.
  - Verification: `npm test`; manually confirm decision ID matches on both
    the XRPL memo and the Solana stamp metadata.
  - Dependencies: Task 6; **blocked until Rudra's real Solana module is
    ready**
  - Files: `src/solana/types.ts`, `src/orchestrator/orchestrator.ts`
  - Scope: S

### Checkpoint: Round 3 (11:00 PM)
- [ ] Payment and stamp share a decision ID on real XRPL testnet and
      Solana devnet

### Phase 5: Full test suite on real networks (target: Round 4, 12:00-4:00 AM)

- [ ] **Task 8: Happy path, injection, and bypass tests**
  - Acceptance: matches the PRD's testing table for these three rows.
  - Verification: `npm test -- tests/e2e/happyPath.test.ts
    tests/e2e/injectionAttack.test.ts tests/e2e/bypassAttack.test.ts`
  - Dependencies: Task 7
  - Files: `tests/e2e/happyPath.test.ts`,
    `tests/e2e/injectionAttack.test.ts`, `tests/e2e/bypassAttack.test.ts`
  - Scope: M

- [ ] **Task 9: Replay, once-per-place, daily-cap tests**
  - Acceptance: matches the PRD's testing table for these three rows.
  - Verification: `npm test -- tests/e2e/replay.test.ts
    tests/e2e/oncePerPlace.test.ts tests/e2e/dailyCap.test.ts`
  - Dependencies: Task 7; **replay and once-per-place need Junaid's real
    Sentinel checks wired in**
  - Files: `tests/e2e/replay.test.ts`, `tests/e2e/oncePerPlace.test.ts`,
    `tests/e2e/dailyCap.test.ts`
  - Scope: M

- [ ] **Task 10: Race and Solana-failure tests**
  - Acceptance: matches the PRD's testing table for these two rows.
  - Verification: `npm test -- tests/e2e/race.test.ts
    tests/e2e/solanaFailure.test.ts`
  - Dependencies: Task 7; **race needs Junaid's per-user lock; Solana
    failure needs Junaid's stamp-retry table**
  - Files: `tests/e2e/race.test.ts`, `tests/e2e/solanaFailure.test.ts`
  - Scope: M

### Checkpoint: Round 4 complete (by 4:00 AM)
- [ ] All 8 required end-to-end tests green on real XRPL testnet and
      Solana devnet
- [ ] Full `npm test` run clean

### Phase 6: Hardening (target: 4:00-8:00 AM)

- [ ] **Task 11: Fix failures from the full run**
  - Description: Address whatever the Round 4 run surfaces — Grok timeout
    handling, decimal-precision edge cases, flaky network calls.
  - Acceptance: full suite green twice in a row.
  - Verification: `npm test` (run twice)
  - Dependencies: Tasks 8-10
  - Files: scoped to whatever failed
  - Scope: varies

## What can start right now (no dependency on Tanish/Rudra/Junaid)

Tasks 1, 2a, 2b, 3, 4, 5 — all of Phase 0 through Round 1 use only fakes
and can be built solo. Nothing here waits on anyone else.

## What's blocked on a hand-off

- Task 6 (real XRPL): blocked until Tanish's interface is agreed in chat
  and his module is ready.
- Task 7 (real Solana): blocked until Rudra's real module is ready
  (interface already agreed, so this is just an integration wait).
- Task 9 (replay, once-per-place): blocked until Junaid's real Sentinel
  checks exist.
- Task 10 (race, Solana-failure retry): blocked until Junaid's per-user
  lock and stamp-retry table exist.

## Risks and Mitigations

| Risk | Impact | Mitigation |
| --- | --- | --- |
| Tanish's XRPL interface isn't agreed by 10 PM | Round 2 slips | Fakes let Phase 0-2 finish regardless; Task 6 is small once the interface lands |
| Grok returns malformed output under real load | Flow breaks | Task 3's fallback path is tested before Round 1 |
| Junaid's Sentinel/lock/retry pieces lag | Tasks 9-10 slip | Tasks 8 (happy/injection/bypass) don't depend on them, so partial e2e coverage still lands on time |
| Real network flakiness during Round 4 | Test timeouts | Per PRD: one retry per network call, generous e2e timeouts |

## Open Questions

- Same as the spec's open questions: XRPL interface shape (Task 6), Grok
  API request/response shape and auth, Junaid's storage interface shape,
  and the metadata URL pattern.
