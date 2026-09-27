# WebPass NYC

WebPass NYC pays people small RLUSD rewards on XRPL for visiting overlooked
NYC cultural sites and small businesses, and gives them a soulbound
passport stamp on Solana. An AI agent (Grok) decides each payout; spending
limits are enforced by a policy engine and by the XRPL ledger itself, so a
prompt-injected or confused agent still can't overspend.

See [PRD.md](./PRD.md) for the full product spec and [CONTRIBUTING.md](./CONTRIBUTING.md)
for commit/PR rules.

## Stack

- Node.js, Express, TypeScript
- SQLite (`better-sqlite3`) for local storage
- XRPL testnet (RLUSD payments)
- Solana devnet (Metaplex Core soulbound stamps)
- Grok (payout agent)

## Getting started

```bash
npm install
cp .env.example .env   # fill in as needed; fake modes work with no keys
npm run dev             # starts the server with ts-node-dev
```

Other scripts:

```bash
npm run build   # compile TypeScript to dist/
npm start        # run the compiled server
npm test         # run the Jest test suite
npm run lint     # lint src/
```

## Project layout

```
src/
  agent/         Grok payout agent
  claims/        legacy per-request claim/lock helpers (superseded by storage + orchestrator)
  data/          shared places list
  db/            SQLite schema and data access
  events/        server-sent-events bus
  orchestrator/  runs one submission through the full pipeline
  policy/        fixed spending rules (no AI)
  routes/        Express route handlers
  sentinel/      location/freshness/replay/once-per-place checks
  solana/        Solana stamp minting (real + fake)
  storage/       StorageLayer implementation used by the orchestrator
  testMode/      test-only policy-bypass flag
  xrpl/          XRPL payment client (fake for now; real client lands separately)
tests/           Jest tests, mirrors the src/ layout
tasks/           local planning notes (not committed)
```

## How a submission is processed

1. `POST /submissions` validates the request (place, photo, location,
   timestamp, wallet addresses) and hands it to the orchestrator.
2. The orchestrator runs, in order: duplicate-request check, Sentinel
   verification, mark claim pending, Grok proposal, policy check, XRPL
   payment, Solana stamp mint, save decision.
3. The response is the saved `DecisionResult`: a `status`
   (`OK`, `BLOCKED_SENTINEL`, `BLOCKED_POLICY`, `REJECTED_BY_LEDGER`, or
   `STAMP_FAILED`) plus `reasons`, the XRPL tx hash, and the Solana asset
   info when applicable.

## Status

Backend is under active development for a hackathon build. XRPL payments
and Solana stamps each run in fake mode by default and switch to the real
networks with `XRPL_MODE=real` and `SOLANA_MODE=real`; the Grok agent
falls back to the base reward until `GROK_API_KEY` is set. See open PRs and [PRD.md](./PRD.md) for what's left.
