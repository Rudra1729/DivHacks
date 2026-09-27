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
- Grok (payout agent and independent payout reviewer)

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
npm run test:e2e # end-to-end tests only
npm run grok:try # try the Grok agent against the real API (needs GROK_API_KEY in .env)
npm run db:reset # delete your local SQLite file (see note below)
```

The server reads settings from `.env` in the folder it runs from.

## Live checks and evidence

`npm run live:check` starts a real server, sends real requests, and confirms the
results on the XRPL testnet and Solana devnet. It writes a report with explorer
links to `evidence/live-runs/`. See [evidence/README.md](./evidence/README.md)
for what each check proves and how to read the results. Use
`npm run live:check:dry` to try it in fake modes without spending anything.

> **After pulling schema changes:** the SQLite tables are created with
> `CREATE TABLE IF NOT EXISTS`, so a local `webpass.sqlite` from before a
> schema change won't get the new columns automatically and queries
> against it will fail with `no such column`. Run `npm run db:reset` (or
> just delete `webpass.sqlite`) after pulling if you hit that.

## Project layout

```
src/
  agent/         Grok payout agent and payout reviewer
  claims/        per-user submission lock
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
2. The orchestrator runs, in order: duplicate-request check, solvency
   check, Sentinel verification, mark claim pending, Grok proposal, policy
   check, independent reviewer check, XRPL payment, Solana stamp mint, save
   decision.
3. The response is the saved `DecisionResult`: a `status`
   (`OK`, `BLOCKED_SOLVENCY`, `BLOCKED_SENTINEL`, `BLOCKED_POLICY`,
   `BLOCKED_REVIEW`, `REJECTED_BY_LEDGER`, `PAYMENT_UNCONFIRMED`,
   `PAYMENT_FAILED`, or `STAMP_FAILED`) plus `reasons`, the XRPL tx hash,
   and the Solana asset info when applicable.

`GET /places` also reports whether each place is currently payable from the
agent wallet. The ledger-backed `payable` value is cached briefly, and
`payableCheck` explains whether the ledger read succeeded.

## Status

Backend is under active development for a hackathon build. XRPL payments
and Solana stamps each run in fake mode by default and switch to the real
networks with `XRPL_MODE=real` and `SOLANA_MODE=real`; the Grok agent
falls back to the base reward until `GROK_API_KEY` is set. See open PRs and [PRD.md](./PRD.md) for what's left.
