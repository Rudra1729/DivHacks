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
npm run missions:refresh # ask Grok for new overlooked NYC missions, add them to GET /places
npm run missions:clear # remove every scouted mission (or pass IDs), leaving only the fixed places
npm run db:reset # delete your local SQLite file (see note below)
npm run reset:user -- you@example.com # let one account do every place again
npm run season:new # restart every place at stamp #1 for everyone (see note below)
```

The server reads settings from `.env` in the folder it runs from.

## Run the full app

The backend also serves the web app in `frontend/`, so one command runs
everything:

1. In `.env`, set `SESSION_SECRET` and `WALLET_ENCRYPTION_KEY` to long random
   strings (`openssl rand -hex 32` works) and keep `EMAIL_MODE=fake`.
2. Run `npm run dev` and open http://localhost:3000.
3. Log in with any email. In fake email mode the six digit code is printed in
   the server console (`[fake email] login code for ...`).
4. Open a mission, take or upload a photo, and wait for the GPS trail
   (5 readings over 10 seconds) before submitting.

Away from Harlem, open http://localhost:3000/?demo=1 instead. It shows a
"pretend my phone is standing at this place" checkbox that sends a simulated
GPS trail near the place, so the whole flow can be demoed from a laptop.

Rewards: cultural places (marked CULTURAL) earn only the Solana stamp, and
civic bounties also pay RLUSD. `CULTURAL_REWARDS=on` makes cultural visits pay
too. `REWARD_SCALE` shrinks every payout and the policy caps by the same
factor, so `REWARD_SCALE=0.01` pays 0.01 RLUSD per civic visit and never more
than 0.05 per visit or 0.10 per wallet per day. Each civic bounty names the
local organization that sponsors it on its mission card and map card.

Photo check: with `GROK_API_KEY` set, Grok's vision model looks at every photo
and blocks the visit (`BLOCKED_PHOTO`) unless it is confident the photo shows
the place. Nothing is claimed or paid before this check. Photos must be JPEG
or PNG. `PHOTO_CHECK=off` turns it off and `PHOTO_MIN_CONFIDENCE` sets the bar.

Testing again: each place can be done once per account, and stamps are
soulbound, so they can never be deleted from a wallet. To let one account
start over, run `npm run reset:user -- you@example.com`. It deletes that
account's visits, claims, audit history, GPS points and the fingerprints of
photos it used, and gives it a fresh Solana wallet. The old stamps stay on the
old wallet, and the XRPL wallet and RLUSD balance are kept. It works while the
server is running, and the page switches to the new wallet on its next
refresh. A photo that Grok rejected is not linked to an account, so it stays
blocked as a reused photo; use a new photo instead. `npm run db:reset` wipes
every account instead.

Stamp numbers: a stamp's number (Legendary #6) counts every stamp for that
place in the current Solana collections, and old stamps can never be deleted,
so `reset:user` does not bring numbers back to #1. `npm run season:new` does:
it creates fresh Harlem and Morningside Heights collections on devnet, writes
them into `.env`, and clears every visit from the database. Accounts, wallets
and RLUSD balances stay. Old stamps stay on chain but no longer count in the
app. Restart the server afterwards. Most places pick their tier from the
number (Legendary for #1 to #10, then Epic, Rare, Common), but a place can set
a fixed tier: every Mudd Building stamp is Epic. Civic bounties have no tier.
They pay RLUSD for a task, so their stamp is a receipt, not a collectible.

Scouted missions: "New Mission" adds a place to `data/generated-missions.json`.
Before a demo, run `npm run missions:clear` to remove them all (or
`npm run missions:clear -- waterfront-museum` for one), then press New Mission
live. The fixed places are never removed. An open page drops the removed pins
and cards when you switch back to its window, and the map re-centers on the
places that are left.

The page talks to the server it was loaded from. To point it at another
server, add `?api=http://host:port` to the URL.

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
  sentinel/      location/freshness/replay/once-per-place and GPS plausibility checks
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

## Location checks

A single latitude and longitude is easy to fake, so each submission also
carries `locationTrail`: a JSON array of the GPS readings the phone took while
the camera was open (`{ latitude, longitude, accuracy, timestamp }`, oldest
first, timestamps in epoch ms). The submitted location must be the last
reading. `frontend/locationCapture.js` collects and sends it.

Sentinel blocks a submission (422 `BLOCKED_SENTINEL`) when:

- there is no trail, it has fewer than 5 readings, covers under 10 seconds, is
  out of time order, or its last reading is over 5 minutes old
- the readings never move at all, which is what a browser location override does
- a reading claims 1 m accuracy or better, or is worse than 200 m
- the coordinates have 4 or fewer decimals, or sit within 1 m of the place's pin
- the wallet (XRPL or Solana) moved faster than 80 km/h since its last passed
  check-in, ignoring moves under 500 m
- two other wallets already sent the exact same point in the last 24 hours

Only passed submissions are recorded as check-ins, so blocked attempts cannot
be used to frame another wallet. Set `LOCATION_CHECKS=off` to skip these checks.
A determined attacker can still script a moving fake trail; these checks stop
the cheap tricks (DevTools overrides, typed coordinates, shared spoofing setups).

## Status

Backend is under active development for a hackathon build. XRPL payments
and Solana stamps each run in fake mode by default and switch to the real
networks with `XRPL_MODE=real` and `SOLANA_MODE=real`. In real XRPL mode a
user's wallet is funded from the testnet faucet and given an RLUSD trust line
before its first payment. Fake-mode stamps are reloaded from the database when
the server starts, so a restart keeps everyone's passport. The Grok agent
falls back to the base reward until `GROK_API_KEY` is set, and the photo check
only runs with a key. See open PRs and [PRD.md](./PRD.md) for what's left.
