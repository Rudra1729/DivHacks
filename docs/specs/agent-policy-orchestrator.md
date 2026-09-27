# Spec: Grok Agent, Policy Engine, Orchestrator, and Test Suite (Arundathi's part)

Source: `PRD.md` (Grok agent, Policy engine, Orchestrator sections; Testing and
acceptance; Guardrails and security) and `CONTRIBUTING.md` (hand-off contract
for Solana stamps).

## Assumptions

1. Grok is called over HTTP via an API key in an env var (`GROK_API_KEY`);
   no SDK is assumed, just `fetch`.
2. "Base reward" (the Grok-failure fallback amount) comes from the place
   record, which Junaid's storage layer exposes; not hardcoded here.
3. The XRPL module (Tanish) and Solana module (Rudra) are consumed through
   TypeScript interfaces the orchestrator imports, matching the pattern
   already agreed for Solana in `CONTRIBUTING.md`. An equivalent XRPL
   interface is assumed but not yet confirmed with Tanish (open question).
4. "Higher of the SQLite and ledger totals" for the daily cap means the
   policy engine calls both a storage function and an XRPL read function
   and takes the max.
5. Test-only bypass and attack-trigger routes are gated by
   `config.isTestMode` (already implemented in `src/config.ts`).

Correct these now if wrong; otherwise the plan below proceeds on them.

## Objective

Build the pieces that make WebPass NYC's core claim true: an AI agent
(Grok) can autonomously move real RLUSD on XRPL, and the money stays inside
limits it cannot talk its way out of, even under prompt injection. Concretely:

- The **Grok agent** turns a submission into a payout proposal.
- The **policy engine** enforces fixed spending rules on that proposal,
  in plain code, no AI.
- The **orchestrator** sequences the whole pipeline (Sentinel → Grok →
  policy → XRPL → Solana → save) and guarantees payments are never repeated.
- The **test suite** proves all 8 required scenarios pass on real XRPL
  testnet and Solana devnet, especially the bypass attack, which is the
  demo's central point for the Ripple prize.

Success looks like: one real submission produces one real RLUSD payment and
one real Solana stamp sharing a decision ID, and every attack test in the
PRD's testing table passes.

## Tech Stack

- Node.js + TypeScript (`tsconfig.json` already in repo, `strict: true`)
- Express (already scaffolded in `src/app.ts`, `src/server.ts`)
- Jest + ts-jest + supertest for tests (already configured)
- better-sqlite3 for storage reads used by the policy engine (owned by
  Junaid, consumed here through an interface)
- Grok API (SpaceXAI credits) for the agent call
- ESLint with `@typescript-eslint` (already configured)

## Commands

```
Dev:    npm run dev
Build:  npm run build
Test:   npm test
Lint:   npm run lint
```

## Project Structure

```
src/
  agent/
    grok.ts          → calls Grok, parses/validates its output
    types.ts          → AgentProposal, AgentInput types
  policy/
    policy.ts        → evaluatePolicy(proposal, context) -> PolicyResult
    rules.ts          → individual rule checks, one function per rule
  orchestrator/
    orchestrator.ts  → runSubmission(input) -> DecisionResult
    types.ts          → shared Decision/Status types
  xrpl/                → Tanish's module, consumed via an interface here
  solana/              → Rudra's module, consumed via the hand-off
                          contract in CONTRIBUTING.md
  storage/             → Junaid's module, consumed via an interface here
tests/
  agent/*.test.ts       → unit tests for Grok parsing/fallback
  policy/*.test.ts       → unit tests for each policy rule
  orchestrator/*.test.ts → unit tests for step sequencing, mocked deps
  e2e/*.test.ts          → the 8 required end-to-end tests, real networks
```

## Code Style

Match what's already in `src/config.ts` and `src/app.ts`: Google-style
docstrings (per `CONTRIBUTING.md` rule 5), 2-space indent, named exports,
`PascalCase` for interfaces/types, `camelCase` for functions and variables.

```typescript
/** Evaluate a Grok proposal against fixed spending rules.

Args:
    proposal (AgentProposal): The agent's proposed amount, recipient, reason.
    context (PolicyContext): Submitting wallet, place, and known totals.

Returns:
    PolicyResult: Pass, or a list of plain-language violation messages.
*/
export function evaluatePolicy(
  proposal: AgentProposal,
  context: PolicyContext
): PolicyResult {
  // ...
}
```

## Testing Strategy

- Unit tests (`tests/agent`, `tests/policy`, `tests/orchestrator`) mock the
  XRPL/Solana/storage interfaces and run fast, no network.
- The 8 required tests (`tests/e2e`) run against real XRPL testnet and
  Solana devnet, per the PRD's testing table:

  | Test | Expected result |
  | --- | --- |
  | Happy path | RLUSD paid, stamp minted, same decision ID both chains |
  | Injection attack | BLOCKED_POLICY (over cap and wrong recipient) |
  | Bypass attack | REJECTED_BY_LEDGER (wallet holds only 10 RLUSD) |
  | Replay | Second identical photo is BLOCKED_SENTINEL |
  | Once per place | Second claim, same user/place, is BLOCKED_SENTINEL |
  | Daily cap | Blocked once 10 RLUSD is reached |
  | Race | Two simultaneous submissions, only allowed amount paid |
  | Solana failure | Payment not repeated, mint retry recorded |

- `npm test` must run both unit and e2e suites; e2e tests get a generous
  timeout (per PRD's "one retry per network call" risk mitigation).

## Boundaries

- **Always:** follow `CONTRIBUTING.md` (no AI authorship on commits, small
  frequent commits, Google-style docstrings); log the policy version on
  every decision; report policy violations in plain words; never repeat a
  payment because a Solana mint failed, queue a retry instead.
- **Ask first:** changing the agreed hand-off interfaces (Solana's
  `mintStamp`/`hasStampForPlace`/`getStamps`, or any new XRPL interface);
  changing the spending caps (5 RLUSD/task, 10 RLUSD/day, 10 RLUSD agent
  allowance); adding new dependencies.
- **Never:** let the policy-skip bypass flag be reachable outside test
  mode; put any treasury key material in this code (it belongs only to
  the guardian process, already enforced in `src/config.ts`); commit
  secrets or `.env` values.

## Success Criteria

- Grok agent returns `{ amount, recipient, reason }` in a fixed format;
  on malformed output or API failure, falls back to the place's base
  reward paid to the submitter's own wallet.
- Policy engine enforces: amount > 0 and ≤ 5 RLUSD; daily total (max of
  SQLite and ledger reads) + amount ≤ 10 RLUSD; recipient equals the
  submitting wallet; place is on the allowlist; amount has ≤ 2 decimal
  places; every violation reported in plain words; policy version logged
  per decision.
- Orchestrator runs steps in order (duplicate-request check → Sentinel →
  mark claim pending → Grok → policy → XRPL payment → Solana mint →
  save), skips the policy step only under the test-only bypass flag, and
  never re-pays when a mint fails.
- All 8 end-to-end tests pass on real XRPL testnet and Solana devnet.

## Open Questions

- What TypeScript interface will Tanish's XRPL module expose (equivalent
  to the Solana hand-off contract)? Needs to be agreed in chat before the
  orchestrator is wired to it, per `CONTRIBUTING.md` rule 6.
- Exact Grok API request/response shape and auth (SpaceXAI credits) —
  not specified in the PRD.
- Storage interface shape for "daily total per user" and "mark claim
  pending" (owned by Junaid) — needed by both the policy engine and the
  orchestrator.
- Metadata URL pattern from Junaid, per the open item already logged in
  the Solana hand-off contract (`CONTRIBUTING.md`); use `METADATA_BASE_URL`
  until answered.
