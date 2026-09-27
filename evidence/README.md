# Live evidence

Proof that WebPass NYC works on the real networks, not just in tests.

Each run starts a real copy of the server, sends real requests to it, and then
checks the results **independently** on the XRPL testnet and Solana devnet. Every
run has its own folder under `live-runs/` with:

| File | What it is |
| --- | --- |
| `REPORT.md` | The readable report: a summary table, then each check with what it proves, every statement it verified, and explorer links anyone can open |
| `results.json` | The same results in one machine-readable file |
| `checks/` | One JSON file per check with the raw evidence (server replies, ledger lookups, balances) |
| `logs/` | What each server process printed |

Only public information is kept: addresses, transaction hashes, and server
replies. The runner scans every file for wallet seeds, API keys, and secret
keys before finishing, and deletes the run if it finds one.

## The runs

| Run | Result | What it shows |
| --- | --- | --- |
| `2026-09-27T03-50-59Z` | 20 passed, 3 failed, 1 skipped | The first run. It **found a real gap**: a wallet that already held a stamp for a place was paid again once the server started with an empty database (check C08 in this run's numbering). One more failure was the same gap showing up in the "blocked attempts move no money" check, because the wrongful payment happened in between. The third was a mistake in the runner: it passed the guardian a key the guardian is designed to refuse. Kept on purpose. |
| `2026-09-27T04-21-35Z` | **25 passed, 0 failed, 0 skipped** | The first clean run after the Solana source-of-truth fix and audit trail merge. Sentinel asks Solana whether the wallet already holds a stamp, so the claim is blocked even with an empty database. |
| `2026-09-27T06-34-47Z` | **25 passed, 0 failed, 0 skipped** | The current final run, after solvency, payable places, the reviewer gate, and the forced 50 RLUSD demo were added. C17 now proves policy stops the forced proposal first and XRPL rejects it when the test-only bypass is enabled. C24 shows the review step and payable flags. |

Two in-between runs are not kept. One failed because the runner reused wallets
that already held stamps from the first run, which the new check correctly
blocked. The runner now creates fresh Solana wallets each run so it can be
repeated. The other passed 24 checks and skipped the audit history, which had not
been merged yet, and is superseded by the final run.

Check C26 (a faked GPS location is rejected) was added after the final run and
has not been run live yet. C15 now claims Apollo Theater instead of Marcus
Garvey Park, because the impossible travel check would block the same wallet
moving 550 m from C14's Studio Museum check-in within seconds.

The two runs number their checks differently, because the "empty database" check
was moved so it is measured after the "blocked attempts move no money" check.
In the first run it is C08. In the final run it is C13.

## What the final run proves

| Claim | Check | Where to look |
| --- | --- | --- |
| A real visit produces a real RLUSD payment and a real stamp | C01 | Ledger transaction and stamp links in the report |
| One decision ID ties the database, the ledger memo, and the stamp together | C02 | Same ID in all four places |
| Stamps are soulbound: even the owner cannot send one to someone else | C03 | The refused transfer |
| Exactly the decided amount moved, nothing more | C04 | Balances before and after |
| Reused photos, repeat claims, and dodging with another wallet are all blocked | C05, C06, C07 | Blocked with clear reasons |
| A repeat claim is blocked even if the server loses its database | C13 | Solana is the source of truth |
| Wrong place, old photo, and bad input are refused, and all reasons are reported together | C08 to C11 | Clear reasons in each reply |
| Every decision has a step-by-step history: Sentinel, claim, agent, policy, reviewer, payment, stamp | C24 | The recorded steps, including the independent review, real payment hash, and stamp address |
| Blocked attempts cost nothing | C12 | Every balance unchanged |
| A prompt injection in the caption cannot redirect money to an attacker | C14 | Real Grok, attacker balance unchanged |
| Repeating a request never pays twice | C15 | One payment for two requests |
| The daily cap counts payments read from the real ledger | C16 | Ledger total versus the 10 RLUSD cap |
| Even with every app-level check bypassed, the ledger refuses a 50 RLUSD overspend | C17 | The rejected transaction on the explorer |
| The agent wallet is capped by the ledger itself | C18 | Trust line limit of 10 RLUSD |
| Key separation: the server cannot hold the treasury key, the guardian cannot hold the agent key | C19, C25 | Both refuse to start |
| The bypass and forced-proposal attack routes do not exist in normal mode | C20 | 404 in normal mode, reachable only on a `NODE_ENV=test` server |
| The guardian reads the live agent wallet and decides on a top-up | C21 | Dry run output |
| A failed stamp never causes a second payment | C22 | Paid once, mint queued for retry |
| The public API works | C23, C24 | Places, wallet stamps, and each place's ledger-backed payable flag |

## Not covered live, and why

- **Race conditions and landing exactly on the 10 RLUSD cap** cannot be reached with the small real rewards used here (0.01 RLUSD each). They are covered by the automated end-to-end tests (`npm run test:e2e`) against a fake ledger, where they pass.

## Things to know before showing this

- **Test networks only.** XRPL testnet and Solana devnet. The RLUSD has no real value.
- **Small rewards.** The runs use a reward scale of 0.01, so a 1 RLUSD place pays 0.01 RLUSD. Each run spends about 0.04 RLUSD (the latest run took the agent wallet from 9.83 to 9.79), a negligible amount of XRP in transaction fees, and about 0.01 devnet SOL for mints (4.9127 to 4.8990 in the latest run).
- **Stamp metadata links point at localhost.** The stamp records a metadata address like `http://localhost:3000/metadata/<decision id>`. It works on the machine running the server, but an outside viewer cannot open it until the server is hosted at a public address (set `METADATA_BASE_URL`).
- **Grok is real and not deterministic.** Amounts and wording can vary between runs.

## Running it again

```bash
npm run live:check              # real networks, spends a few cents of test funds
npm run live:check:dry          # fake modes, spends nothing, to try the runner
npm run live:check -- --only C05,C06   # just some checks
```

It needs the wallets in `.keys/`, and `.env` and `.env.guardian` set up as
described in the main README. Set `LIVE_REWARD_SCALE` to change the reward
scale (default 0.01).
