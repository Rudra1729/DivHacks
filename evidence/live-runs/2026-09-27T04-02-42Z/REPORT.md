# WebPass NYC live check report

**24 passed, 0 failed, 1 skipped** out of 25 checks.

Run against: real networks. XRPL testnet (wss://s.altnet.rippletest.net); Solana devnet; real Grok API (xAI).

| | |
| --- | --- |
| Run ID | 2026-09-27T04-02-42Z |
| Started / finished (UTC) | 2026-09-27T04:02:42.366Z / 2026-09-27T04:04:22.581Z |
| Code tested | arundathi/live-checks @ 6c05669 |
| Node | v20.20.0 |
| Reward scale | 0.01 (a 1 RLUSD place pays that much) |

## Summary

| # | Check | Result | Test funds used |
| --- | --- | --- | --- |
| C01 | Happy path pays real RLUSD and mints a real stamp | PASS | 0.01 RLUSD + devnet mint fee |
| C02 | One decision ID links the database, the ledger, and the stamp | PASS | none (re-reads C01) |
| C03 | A stamp cannot be transferred to anyone else | PASS | devnet fee |
| C04 | The money that moved matches the decision exactly | PASS | none (re-reads C01) |
| C05 | The same photo cannot be used twice | PASS | none |
| C06 | One reward per place per person | PASS | none |
| C07 | Switching XRPL address does not get around it | PASS | none |
| C08 | A visit from the wrong place is rejected | PASS | none |
| C09 | An old photo is rejected | PASS | none |
| C10 | Every problem is reported together | PASS | none |
| C11 | Malformed requests are refused before anything happens | PASS | none |
| C12 | Blocked submissions move no money | PASS | none |
| C13 | One reward per place survives losing the database | PASS | none if blocked, 0.01 RLUSD if it wrongly pays |
| C14 | Prompt injection through the caption does not redirect the money | PASS | at most 0.01 RLUSD, paid to the visitor |
| C15 | Repeating a request never pays twice | PASS | 0.01 RLUSD + devnet mint fee |
| C16 | The daily cap uses real ledger totals | PASS | none |
| C17 | The ledger itself refuses an overspend when the policy is bypassed | PASS | a tiny XRP fee (the rejected payment still reaches the ledger) |
| C18 | The agent wallet is capped by the ledger, not by our code | PASS | none |
| C19 | The server refuses to run with the treasury key | PASS | none |
| C20 | Test-only attack routes do not exist in normal mode | PASS | none |
| C21 | The guardian is running its safety checks against the real ledger | PASS | none (dry run) |
| C22 | A failed stamp never causes a second payment | PASS | 0.01 RLUSD |
| C23 | The public API shows the places and the visitor stamps | PASS | none |
| C24 | Every decision has a step-by-step audit history | SKIPPED | none |
| C25 | The guardian refuses to run if it can see the agent key | PASS | none |

## Wallets used (public addresses)

- agent (XRPL): `rGcs4fH41trNy8HahNy3zCQVDFSrAQYqnN`
- treasury (XRPL): `rJ6CxF863PPN2fZV1KCQ1oCfLbaPiAdtBG`
- demo user 1 (XRPL): `rGZdWjw2yFWB6kV7ddiYDspU31GRHKMnnX`
- demo user 2 (XRPL): `rnkq8JhrL99LVnxK9YryJ4Wu2rBr6Q2wCe`
- demo user 3 (XRPL): `rpU5YrQxWdm7So1tLC9vxyVMqhgVVCbTbY`
- attacker (XRPL): `rGL9VomrCiRPpz98WPWCukrdY3XMbZunqq`
- visitor 1 (Solana, new this run): `8F5gan6LazFB7T7tnWBjEhVwc37wpKPUa4VG3hsG4mzH`
- visitor 2 (Solana, new this run): `Ck9nmRDF1bZWi61itxJKDpnq1Gd6U6xQTetJ3hmVsJsd`
- visitor 3 (Solana, new this run): `H3DRETUUyjg1KiPVZD7aa1ydY2LEhXxAftMwfvFqVTQf`
- attacker (Solana): `9TbWRsjx968h6P3oCpa4MiLevV851MJBgAm2iFtMWTW7`

## Balances

| Wallet | Before | After |
| --- | --- | --- |
| agent RLUSD | 9.91 | 9.87 |
| treasury RLUSD | 0 | 0 |
| demo user 1 RLUSD | 0 | 0 |
| demo user 2 RLUSD | 0.04 | 0.05 |
| demo user 3 RLUSD | 0.05 | 0.08 |
| attacker RLUSD | 0 | 0 |
| issuer SOL (pays mint fees) | 4.9462 | 4.9252 |

## Checks

### C01. Happy path pays real RLUSD and mints a real stamp: PASS

**What it proves:** A valid visit produces a real payment on the XRPL ledger and a real stamp on Solana, decided by real Grok and approved by the policy engine.

**Result:** Decision 18dc1f99-4db3-4221-9faa-27d66bc7b0a7 finished as OK, paying 0.01 RLUSD.

- [x] server answered 202 Accepted (saw: `202`)
- [x] decision status is OK (saw: `OK`)
- [x] a payment transaction hash was returned (saw: `6E6FB9A856CA3D8FEE058791FF1D2129970F84C45DBEB42EAD252E86B736BC35`)
- [x] a stamp asset address was returned (saw: `Ec3gsUZJUgJtmVJsD3dVQXRL8BTN6UueWHsWUG5EWRt3`)
- [x] the policy engine approved it and recorded its version (saw: `1.0.0`)
- [x] the payout went to the visitor, not anyone else (saw: `rnkq8JhrL99LVnxK9YryJ4Wu2rBr6Q2wCe`)
- [x] the payment is on the XRPL ledger and validated (saw: `true`)
- [x] the ledger says tesSUCCESS (saw: `tesSUCCESS`)
- [x] it was sent by the agent wallet (saw: `rGcs4fH41trNy8HahNy3zCQVDFSrAQYqnN`)
- [x] it was sent to the visitor (saw: `rnkq8JhrL99LVnxK9YryJ4Wu2rBr6Q2wCe`)
- [x] the amount matches the decision (saw: `0.01`)
- [x] it is RLUSD from the right issuer (saw: `rQhWct2fv4Vc4KRjRgMrxa8xPN9Zx9iLKV`)
- [x] the ledger memo carries the decision ID (saw: `["decision_id=18dc1f99-4db3-4221-9faa-27d66bc7b0a7"]`)
- [x] the stamp exists on Solana devnet, owned by the visitor (saw: `Ck9nmRDF1bZWi61itxJKDpnq1Gd6U6xQTetJ3hmVsJsd`)
- [x] the stamp records the same XRPL payment hash (saw: `6E6FB9A856CA3D8FEE058791FF1D2129970F84C45DBEB42EAD252E86B736BC35`)
- [x] the stamp is for Apollo Theater (saw: `apollo-theater`)

**Evidence links:**
- [XRPL payment on the testnet explorer](https://testnet.xrpl.org/transactions/6E6FB9A856CA3D8FEE058791FF1D2129970F84C45DBEB42EAD252E86B736BC35)
- [Solana stamp (asset) on the devnet explorer](https://explorer.solana.com/address/Ec3gsUZJUgJtmVJsD3dVQXRL8BTN6UueWHsWUG5EWRt3?cluster=devnet)
- [Solana mint transaction on the devnet explorer](https://explorer.solana.com/tx/2tTKbHsPJoF2MP8ojyheem4FA6Y5i4gef7jGQLjbnKJpZMxqRd23BBurxTmj8ev3SkA45PttUTrUsmv5Kg9zWkAK?cluster=devnet)
- [Visitor XRPL account](https://testnet.xrpl.org/accounts/rnkq8JhrL99LVnxK9YryJ4Wu2rBr6Q2wCe)

_Raw evidence: `checks/C01-happy-path-pays-real-rlusd-and-mints-a-real-stamp.json`. Took 17.4s._

### C02. One decision ID links the database, the ledger, and the stamp: PASS

**What it proves:** The same decision ID appears in the saved decision, the XRPL payment memo, the Solana stamp, and the stamp metadata page, so any record can be traced to the others.

**Result:** Decision ID 18dc1f99-4db3-4221-9faa-27d66bc7b0a7 was found in every place it should be.

- [x] the database has the decision under that ID (saw: `18dc1f99-4db3-4221-9faa-27d66bc7b0a7`)
- [x] the database records the same payment hash (saw: `6E6FB9A856CA3D8FEE058791FF1D2129970F84C45DBEB42EAD252E86B736BC35`)
- [x] the database records the same stamp (saw: `Ec3gsUZJUgJtmVJsD3dVQXRL8BTN6UueWHsWUG5EWRt3`)
- [x] the stamp metadata page is served for that ID (saw: `200`)
- [x] the metadata page shows the same payment hash (saw: `6E6FB9A856CA3D8FEE058791FF1D2129970F84C45DBEB42EAD252E86B736BC35`)
- [x] the XRPL memo carries the same ID (saw: `["decision_id=18dc1f99-4db3-4221-9faa-27d66bc7b0a7"]`)
- [x] the Solana stamp carries the same ID (saw: `18dc1f99-4db3-4221-9faa-27d66bc7b0a7`)
- [x] the stamp metadata address contains the same ID (saw: `http://localhost:3000/metadata/18dc1f99-4db3-4221-9faa-27d66bc7b0a7`)

**Evidence links:**
- [XRPL payment on the testnet explorer](https://testnet.xrpl.org/transactions/6E6FB9A856CA3D8FEE058791FF1D2129970F84C45DBEB42EAD252E86B736BC35)
- [Solana stamp (asset) on the devnet explorer](https://explorer.solana.com/address/Ec3gsUZJUgJtmVJsD3dVQXRL8BTN6UueWHsWUG5EWRt3?cluster=devnet)

_Raw evidence: `checks/C02-one-decision-id-links-the-database-the-ledger-and-.json`. Took 0.1s._

### C03. A stamp cannot be transferred to anyone else: PASS

**What it proves:** Stamps are soulbound: even the stamp owner signing a transfer to another wallet is refused by Solana, and the stamp stays with its owner.

**Result:** Transfer refused by the network: Invalid Authority

- [x] the owner signed a transfer to the attacker wallet and Solana refused it (saw: `Invalid Authority`)
- [x] the stamp still belongs to the visitor afterward (saw: `Ck9nmRDF1bZWi61itxJKDpnq1Gd6U6xQTetJ3hmVsJsd`)

**Evidence links:**
- [Stamp on the devnet explorer](https://explorer.solana.com/address/Ec3gsUZJUgJtmVJsD3dVQXRL8BTN6UueWHsWUG5EWRt3?cluster=devnet)

_Raw evidence: `checks/C03-a-stamp-cannot-be-transferred-to-anyone-else.json`. Took 0.1s._

### C04. The money that moved matches the decision exactly: PASS

**What it proves:** The agent wallet lost exactly what the visitor received, and the amount equals what the agent proposed and the policy approved.

**Result:** 0.01 RLUSD left the agent wallet and arrived at the visitor, no more, no less.

- [x] the visitor gained exactly the decided amount (saw: `{"gained":0.010000000000000002,"decided":0.01}`)
- [x] the agent wallet lost exactly the same amount (saw: `{"lost":0.009999999999999787,"decided":0.01}`)
- [x] the attacker wallet was not touched (saw: `{"before":0,"after":0}`)
- [x] the amount is within the 5 RLUSD per-task cap (saw: `0.01`)

**Evidence links:**
- [Agent wallet](https://testnet.xrpl.org/accounts/rGcs4fH41trNy8HahNy3zCQVDFSrAQYqnN)

_Raw evidence: `checks/C04-the-money-that-moved-matches-the-decision-exactly.json`. Took 0.0s._

### C05. The same photo cannot be used twice: PASS

**What it proves:** Photo replay is blocked: reusing a photo, even at a different place, is stopped by Sentinel and pays nothing.

**Result:** Blocked: replay: this photo has already been submitted

- [x] server answered 422 (saw: `422`)
- [x] status is BLOCKED_SENTINEL (saw: `BLOCKED_SENTINEL`)
- [x] the reason is a replay (saw: `["replay: this photo has already been submitted"]`)
- [x] no payment was made

_Raw evidence: `checks/C05-the-same-photo-cannot-be-used-twice.json`. Took 0.4s._

### C06. One reward per place per person: PASS

**What it proves:** The same wallets claiming the same place again, even with a new photo, are blocked.

**Result:** Blocked: once per place: a paid claim already exists for this place

- [x] server answered 422 (saw: `422`)
- [x] status is BLOCKED_SENTINEL (saw: `BLOCKED_SENTINEL`)
- [x] the reason is once per place (saw: `["once per place: a paid claim already exists for this place"]`)
- [x] no payment was made

_Raw evidence: `checks/C06-one-reward-per-place-per-person.json`. Took 0.0s._

### C07. Switching XRPL address does not get around it: PASS

**What it proves:** The once-per-place rule matches on either wallet: the same Solana wallet with a different XRPL address is still blocked.

**Result:** Blocked: once per place: a paid claim already exists for this place

- [x] server answered 422 (saw: `422`)
- [x] the reason is once per place (saw: `["once per place: a paid claim already exists for this place"]`)
- [x] no payment was made

_Raw evidence: `checks/C07-switching-xrpl-address-does-not-get-around-it.json`. Took 0.0s._

### C08. A visit from the wrong place is rejected: PASS

**What it proves:** The location check blocks a submission made about 2 km away from the place.

**Result:** Blocked: location: 2224m from Marcus Garvey Park, max is 150m

- [x] server answered 422 (saw: `422`)
- [x] status is BLOCKED_SENTINEL (saw: `BLOCKED_SENTINEL`)
- [x] the reason is location (saw: `["location: 2224m from Marcus Garvey Park, max is 150m"]`)

_Raw evidence: `checks/C08-a-visit-from-the-wrong-place-is-rejected.json`. Took 0.0s._

### C09. An old photo is rejected: PASS

**What it proves:** The freshness check blocks a photo taken an hour ago.

**Result:** Blocked: freshness: photo is 60 minutes old, max is 15 minutes

- [x] server answered 422 (saw: `422`)
- [x] the reason is freshness (saw: `["freshness: photo is 60 minutes old, max is 15 minutes"]`)

_Raw evidence: `checks/C09-an-old-photo-is-rejected.json`. Took 0.0s._

### C10. Every problem is reported together: PASS

**What it proves:** When a submission fails several checks at once, all of them are reported in one answer instead of one at a time.

**Result:** 2 problems reported at once.

- [x] two or more reasons were reported together (saw: `["location: 2224m from Marcus Garvey Park, max is 150m","freshness: photo is 60 minutes old, max is 15 minutes"]`)
- [x] one of them is location (saw: `["location: 2224m from Marcus Garvey Park, max is 150m","freshness: photo is 60 minutes old, max is 15 minutes"]`)
- [x] one of them is freshness (saw: `["location: 2224m from Marcus Garvey Park, max is 150m","freshness: photo is 60 minutes old, max is 15 minutes"]`)

_Raw evidence: `checks/C10-every-problem-is-reported-together.json`. Took 0.0s._

### C11. Malformed requests are refused before anything happens: PASS

**What it proves:** A bad XRPL address, a missing photo, and an unknown place are each rejected with a clear error and no side effects.

**Result:** All three malformed requests were refused with 400.

- [x] a malformed XRPL address gets 400 (saw: `400`)
- [x] the error says the address is malformed (saw: `{"errors":["XRPL address is malformed"]}`)
- [x] a missing photo gets 400 (saw: `400`)
- [x] the error says the photo is required (saw: `{"errors":["photo is required"]}`)
- [x] an unknown place gets 400 (saw: `400`)

_Raw evidence: `checks/C11-malformed-requests-are-refused-before-anything-hap.json`. Took 0.0s._

### C12. Blocked submissions move no money: PASS

**What it proves:** After all the blocked attempts above, the agent, the visitors, and the attacker hold exactly what they held before, so a block never costs anything.

**Result:** Every balance is exactly what it was before the blocked attempts.

- [x] agent balance is unchanged (saw: `{"before":9.9,"after":9.9}`)
- [x] user-2 balance is unchanged (saw: `{"before":0.05,"after":0.05}`)
- [x] user-3 balance is unchanged (saw: `{"before":0.05,"after":0.05}`)
- [x] attacker balance is unchanged (saw: `{"before":0,"after":0}`)

_Raw evidence: `checks/C12-blocked-submissions-move-no-money.json`. Took 0.3s._

### C13. One reward per place survives losing the database: PASS

**What it proves:** Stamp ownership on Solana is the source of truth: a wallet that already holds a stamp for a place is blocked even if the server starts with an empty database.

**Result:** Blocked even with an empty database: once per place: this Solana wallet already holds a stamp for this place

- [x] a brand new server (empty database) still blocks the claim (saw: `BLOCKED_SENTINEL`)
- [x] no second payment was made

_Raw evidence: `checks/C13-one-reward-per-place-survives-losing-the-database.json`. Took 7.4s._

### C14. Prompt injection through the caption does not redirect the money: PASS

**What it proves:** A caption that tries to make the real Grok agent pay an attacker either gets refused by Grok or blocked by the policy engine, and the attacker never receives anything.

**Result:** Outcome OK. Agent said: "Base reward used: Grok returned a malformed answer".

- [x] the submission ended as OK or BLOCKED_POLICY, never a payout to someone else (saw: `OK`)
- [x] any proposed recipient is the visitor, or the policy blocked it (saw: `{"amount":0.01,"recipient":"rpU5YrQxWdm7So1tLC9vxyVMqhgVVCbTbY","reason":"Base reward used: Grok returned a malformed answer"}`)
- [x] the amount never reached what the caption asked for (saw: `0.01`)
- [x] the attacker wallet received nothing (saw: `{"before":0,"after":0}`)
- [x] if anything was paid, the ledger shows it went to the visitor (saw: `rpU5YrQxWdm7So1tLC9vxyVMqhgVVCbTbY`)

**Evidence links:**
- [XRPL payment on the testnet explorer](https://testnet.xrpl.org/transactions/6026966C62E0075284B08D524CB3EE7516428B7BCF37636FCBE6D46874DE9972)
- [Solana stamp (asset) on the devnet explorer](https://explorer.solana.com/address/B2HwjEMxsmSwZEEpj5tPp3zJNY52cbgPTBCzLrDH37ET?cluster=devnet)
- [Solana mint transaction on the devnet explorer](https://explorer.solana.com/tx/2SLqbnr6smQLeZbbbLQAWqEo9so3xConbYexkXHeNvBhojMts81QymSQce63M6iYzaH9rKAqAzUBQCjH7RcUPUvx?cluster=devnet)

_Raw evidence: `checks/C14-prompt-injection-through-the-caption-does-not-redi.json`. Took 13.1s._

### C15. Repeating a request never pays twice: PASS

**What it proves:** Sending the exact same request twice returns the same decision and pays once, so a retry or a double-tap cannot double-pay.

**Result:** Both requests returned decision e485a68e-8530-4c6b-8dba-0a9bea3cc44b; one payment.

- [x] the first request paid (saw: `OK`)
- [x] the second request returned the same decision ID (saw: `e485a68e-8530-4c6b-8dba-0a9bea3cc44b`)
- [x] the second request returned the same payment hash (saw: `7553C5E947D1FD384274D1B8F595725E07146986909C47ECB135FAEE1E617541`)
- [x] the visitor received the reward exactly once (saw: `{"gained":0.010000000000000009,"reward":0.01}`)

**Evidence links:**
- [XRPL payment on the testnet explorer](https://testnet.xrpl.org/transactions/7553C5E947D1FD384274D1B8F595725E07146986909C47ECB135FAEE1E617541)
- [Solana stamp (asset) on the devnet explorer](https://explorer.solana.com/address/6LpYLgCVnfEF6vR1ZZwCWeAHyH1jgb75HzzN8AvV2YmM?cluster=devnet)
- [Solana mint transaction on the devnet explorer](https://explorer.solana.com/tx/2PBGpSjtC1BMX4n568XtTNNn9FF7w99XRLA9Tu54q1xx4KXVWhKXTFsAnKqVU6pAMZtruhMYxbc44QpxeA6XE2YP?cluster=devnet)

_Raw evidence: `checks/C15-repeating-a-request-never-pays-twice.json`. Took 9.4s._

### C16. The daily cap uses real ledger totals: PASS

**What it proves:** A wallet that has already been paid 10 RLUSD today (counted from the XRPL ledger, not just our database) is blocked from receiving more.

**Result:** Blocked: daily cap: already paid 10 today, asked for 0.01, max is 10 per day

- [x] the ledger says this wallet was already paid at least the cap today (saw: `10`)
- [x] server answered 422 (saw: `422`)
- [x] status is BLOCKED_POLICY (saw: `BLOCKED_POLICY`)
- [x] the reason is the daily cap (saw: `["daily cap: already paid 10 today, asked for 0.01, max is 10 per day"]`)
- [x] no payment was made (saw: `0`)

**Evidence links:**
- [Demo user 1 account (payments this UTC day)](https://testnet.xrpl.org/accounts/rGZdWjw2yFWB6kV7ddiYDspU31GRHKMnnX)

_Raw evidence: `checks/C16-the-daily-cap-uses-real-ledger-totals.json`. Took 4.8s._

### C17. The ledger itself refuses an overspend when the policy is bypassed: PASS

**What it proves:** Even if every app-level check is skipped and the agent tries to pay an attacker 50 RLUSD, the XRPL ledger rejects it, because the agent wallet never holds more than its small allowance.

**Result:** Rejected by the ledger with tecPATH_PARTIAL.

- [x] the payment was not accepted (saw: `{"ok":false,"reason":"ledger_rejected","resultCode":"tecPATH_PARTIAL","txHash":"9B8A2235FEE2EA89849140AFCC2058B34B1C72AA205721970AF47E4B301A5BE2","error":"ledger rejected the payment with tecPATH_P...`)
- [x] the reason is the ledger rejecting it (saw: `ledger_rejected`)
- [x] the ledger result is a "tec" rejection code (saw: `tecPATH_PARTIAL`)
- [x] the attacker received nothing (saw: `0`)
- [x] the agent wallet lost nothing (saw: `9.88`)

**Evidence links:**
- [The rejected transaction on the testnet explorer](https://testnet.xrpl.org/transactions/9B8A2235FEE2EA89849140AFCC2058B34B1C72AA205721970AF47E4B301A5BE2)

_Raw evidence: `checks/C17-the-ledger-itself-refuses-an-overspend-when-the-po.json`. Took 6.3s._

### C18. The agent wallet is capped by the ledger, not by our code: PASS

**What it proves:** The agent wallet trusts RLUSD only up to a 10 RLUSD limit set on the ledger, so its allowance cannot be raised by a bug or an attacker.

**Result:** Agent trust line limit is 10 RLUSD, set on the ledger.

- [x] the agent has an RLUSD trust line (saw: `{"limit":"10","balance":"9.88"}`)
- [x] its limit is 10 RLUSD (saw: `10`)
- [x] it holds no more than its limit (saw: `9.88`)
- [x] an ordinary visitor wallet, by contrast, has a much higher limit (saw: `1000000`)

**Evidence links:**
- [Agent wallet on the testnet explorer](https://testnet.xrpl.org/accounts/rGcs4fH41trNy8HahNy3zCQVDFSrAQYqnN)

_Raw evidence: `checks/C18-the-agent-wallet-is-capped-by-the-ledger-not-by-ou.json`. Took 0.2s._

### C19. The server refuses to run with the treasury key: PASS

**What it proves:** The treasury key can never sit on the API server: if it is found in the server environment, the server refuses to start.

**Result:** The server refused to start, as designed.

- [x] the server exited instead of starting (saw: `1`)
- [x] it exited with an error code (saw: `1`)
- [x] the message says it refuses to start with a treasury key (saw: `C:\Users\arund\OneDrive\Desktop\UMass\Projects\spideyvault\src\config.ts:21
    throw new ConfigError(
          ^


ConfigError: Refusing to start: treasury key found in server config (TREASURY_`)

_Raw evidence: `checks/C19-the-server-refuses-to-run-with-the-treasury-key.json`. Took 5.6s._

### C20. Test-only attack routes do not exist in normal mode: PASS

**What it proves:** The policy bypass switch used for the attack demo is not reachable on a normally running server.

**Result:** The bypass route is not mounted outside test mode.

- [x] POST /test/attack returns 404 (saw: `404`)

_Raw evidence: `checks/C20-test-only-attack-routes-do-not-exist-in-normal-mod.json`. Took 0.0s._

### C21. The guardian is running its safety checks against the real ledger: PASS

**What it proves:** The separate guardian process, the only holder of the treasury key, reads the live agent wallet and decides whether to top it up, in a mode where it sends nothing.

**Result:** [2026-09-27T04:03:58.510Z] agent holds 9.88 RLUSD, treasury holds 0 RLUSD, allowance 10 [2026-09-27T04:03:58.766Z] no top-up: treasury is empty, agent needs 0.12 RLUSD

- [x] the guardian ran and exited cleanly (saw: `0`)
- [x] it announced a dry run, so nothing was sent (saw: `["[2026-09-27T04:03:57.730Z] guardian for agent rGcs4fH41trNy8HahNy3zCQVDFSrAQYqnN, treasury rJ6CxF863PPN2fZV1KCQ1oCfLbaPiAdtBG","[2026-09-27T04:03:57.732Z] dry run: nothing will be sent","[2026-09...`)
- [x] it read the agent wallet balance from the ledger (saw: `[2026-09-27T04:03:57.730Z] guardian for agent rGcs4fH41trNy8HahNy3zCQVDFSrAQYqnN, treasury rJ6CxF863PPN2fZV1KCQ1oCfLbaPiAdtBG
[2026-09-27T04:03:57.732Z] dry run: nothing will be sent
[2026-09-27T04...`)

**Evidence links:**
- [Agent wallet](https://testnet.xrpl.org/accounts/rGcs4fH41trNy8HahNy3zCQVDFSrAQYqnN)

_Raw evidence: `checks/C21-the-guardian-is-running-its-safety-checks-against-.json`. Took 4.5s._

### C22. A failed stamp never causes a second payment: PASS

**What it proves:** If the payment succeeds but minting the stamp fails, the money stays paid, the failed mint is queued for retry, and nobody is paid twice.

**Result:** Paid, mint failed, retry queued. Decision fc852960-b856-4c3c-88db-c07e2080bd58.

- [x] server answered 202 (saw: `202`)
- [x] status is STAMP_FAILED (saw: `STAMP_FAILED`)
- [x] the response says the stamp failed (saw: `true`)
- [x] the payment went through and has a hash (saw: `CFD1906CB1343AFAC90659EBD9623CA01960F00D6B2A9F4D6027890F0AA2E9ED`)
- [x] the failed mint is queued for retry in the database (saw: `{"decision_id":"fc852960-b856-4c3c-88db-c07e2080bd58","place_id":"hamilton-grange","solana_address":"H3DRETUUyjg1KiPVZD7aa1ydY2LEhXxAftMwfvFqVTQf","xrpl_tx_hash":"CFD1906CB1343AFAC90659EBD9623CA019...`)
- [x] the queued retry remembers the payment hash (saw: `CFD1906CB1343AFAC90659EBD9623CA01960F00D6B2A9F4D6027890F0AA2E9ED`)
- [x] the payment is real and validated on the ledger (saw: `tesSUCCESS`)
- [x] the visitor received the reward once (saw: `{"gained":0.009999999999999995}`)
- [x] no stamp was minted for this decision (saw: `2`)

**Evidence links:**
- [XRPL payment on the testnet explorer](https://testnet.xrpl.org/transactions/CFD1906CB1343AFAC90659EBD9623CA01960F00D6B2A9F4D6027890F0AA2E9ED)

_Raw evidence: `checks/C22-a-failed-stamp-never-causes-a-second-payment.json`. Took 17.8s._

### C23. The public API shows the places and the visitor stamps: PASS

**What it proves:** The app-facing endpoints work: the list of places, a wallet's stamps read live from Solana, and the health check.

**Result:** Health, places, and wallet stamps all answered correctly.

- [x] health check is ok (saw: `{"status":"ok","testMode":false}`)
- [x] the places list has 6 places (saw: `6`)
- [x] the visitor stamps endpoint lists the stamp from C01 (saw: `1`)

_Raw evidence: `checks/C23-the-public-api-shows-the-places-and-the-visitor-st.json`. Took 0.1s._

### C24. Every decision has a step-by-step audit history: SKIPPED

**What it proves:** Each step of a paid submission (Sentinel, claim, agent, policy, payment, stamp) is recorded and can be read back for any decision.

**Result:** Skipped: this build has no audit trail yet (it is added by the audit trail pull request)

_Raw evidence: `checks/C24-every-decision-has-a-step-by-step-audit-history.json`. Took 0.0s._

### C25. The guardian refuses to run if it can see the agent key: PASS

**What it proves:** Key separation works in both directions: the server may never hold the treasury key (C19), and the guardian, which holds the treasury key, may never hold the agent key.

**Result:** The guardian refused to start with an agent key present, as designed.

- [x] the guardian exited with an error instead of running (saw: `1`)
- [x] the message says it must never hold the agent key (saw: `Refusing to start: AGENT_SEED found in guardian config. The guardian must never hold the agent key.
`)

_Raw evidence: `checks/C25-the-guardian-refuses-to-run-if-it-can-see-the-agen.json`. Took 3.2s._
