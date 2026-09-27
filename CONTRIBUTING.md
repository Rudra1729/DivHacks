# Contributing Rules

These are the rules for this repo. Follow them for every commit and PR.

## Quick reference

1. No AI authorship on commits or PRs.
2. Simple, plain commit messages, no em dashes.
3. Commit frequently enough. Don't push a big feature all together.
4. PR descriptions detailed enough to review without reading the diff.
5. Google-style docstrings on all functions, classes, and modules.
6. Agree on hand-off contracts in chat before coding against them.
7. Wrap async route handlers in `asyncHandler`, and check database errors by message in tests.

## 1. No AI authorship on pushes

Do not add Claude, Anthropic, or any AI tool as an author or co-author on
commits or pull requests. No "Co-Authored-By" lines for AI tools, no
"Generated with" footers. Commits and PRs should list only human authors.

## 2. Simple commit messages

- Short, plain, and to the point.
- No em dashes. Use periods or commas instead.
- Describe what changed, not why it's amazing.

Example:

```
Fix login redirect bug
Add user profile endpoint
Update README setup steps
```

## 3. Commit frequently enough

Commit frequently enough. Don't push a big feature all together as one
giant commit or one giant PR.

- Each commit should represent one coherent change (e.g. "add validation",
  then "add tests for validation", not both bundled with five other things).
- Commit as soon as a small piece works, don't wait until the whole feature
  is done to make your first commit.
- This makes PRs easier to review and history easier to bisect when
  something breaks.

## 4. Detailed PR descriptions

Write PR descriptions so a reviewer can understand what changed and why
without having to read the diff line by line. Include:

- What problem this solves.
- What changed, in plain language (what files/areas, what behavior is
  different before vs after).
- How it was tested.
- Anything a reviewer should pay special attention to (edge cases, risk
  areas, follow-up work).

Assume the reader wants to understand the change well enough to approve it
from the description alone.

### Before opening a PR

- [ ] Description explains the problem and the fix in plain language.
- [ ] Testing steps are listed.
- [ ] Risk areas or follow-up work are called out.
- [ ] New/changed functions have Google-style docstrings.

## 5. Docstrings: Google style (Napoleon)

All functions, classes, and modules must have docstrings following the
Google style docstring format, as documented here:
https://sphinxcontrib-napoleon.readthedocs.io/en/latest/example_google.html

Key sections to use where applicable: `Args`, `Returns`, `Raises`, `Yields`,
`Attributes`, `Example`, `Note`.

Function example:

```python
def add(a, b):
    """Add two numbers together.

    Args:
        a (int): The first number.
        b (int): The second number.

    Returns:
        int: The sum of a and b.

    Raises:
        TypeError: If a or b is not a number.
    """
    return a + b
```

Class example:

```python
class Cache:
    """A simple in-memory cache.

    Attributes:
        max_size (int): Maximum number of items the cache can hold.
    """

    def __init__(self, max_size):
        """Initialize the cache.

        Args:
            max_size (int): Maximum number of items the cache can hold.
        """
        self.max_size = max_size
```

Module example (top of file):

```python
"""Utilities for parsing and validating user input.

This module provides helper functions used across the API layer to
normalize and validate incoming request data.
"""
```

### Checking docstrings locally

You can lint docstrings against this format with `pydocstyle` or by enabling
the Napoleon extension in Sphinx. Run a quick check before opening a PR:

```
pip install pydocstyle
pydocstyle --convention=google path/to/module.py
```

## 6. Hand-off contracts

Before coding against another teammate's module, agree on its interface in
chat first. Don't start integrating against a hand-off contract that hasn't
been confirmed by the person who owns that module.

### Solana stamps hand-off (owner: Rudra)

Agreed interface for the stamp minting module:

```typescript
export interface MintStampInput {
  decisionId: string;
  placeId: string;
  userSolanaAddress: string;
  xrplTxHash: string;
}

export type StampTier = 'Legendary' | 'Epic' | 'Rare' | 'Common' | 'Late Explorer';

export type MintStampResult =
  | { ok: true; assetAddress: string; signature: string; serial: number; tier: StampTier }
  | { ok: false; error: string };

export function mintStamp(input: MintStampInput): Promise<MintStampResult>;
export function hasStampForPlace(solanaAddress: string, placeId: string): Promise<boolean>;
export function getStamps(solanaAddress: string): Promise<Stamp[]>;
```

Stamp rarity is decided by the order stamps are found at each place. Each
place has 1000 numbered stamps, and the serial alone picks the tier:

| Serials | Tier |
|---|---|
| 1 to 10 | Legendary |
| 11 to 100 | Epic |
| 101 to 400 | Rare |
| 401 to 1000 | Common |
| 1001 and up | Late Explorer |

Serials are counted from chain inside the mint queue, so anyone can recount
them. Late Explorer stamps have no limit, because the reward is paid before
the stamp is minted. Serial and tier are stored as stamp attributes, on the
decision row, and on the metadata page. Stamps minted before rarity have
`serial` and `tier` set to `null`.

Open item: ask Junaid for the metadata URL pattern (for example
`GET /metadata/:decisionId`). Until he answers, use a `METADATA_BASE_URL`
env var.

### XRPL payments hand-off (owner: Tanish)

Agreed interface for the XRPL payment module, in `src/xrpl/index.ts`
(`XRPL_MODE=fake|real`, same pattern as `SOLANA_MODE`):

```typescript
export interface SendPaymentInput {
  decisionId: string;   // memo + idempotency key
  recipient: string;    // sent exactly as given
  amount: number;       // RLUSD, > 0, max 2 decimals
}

export type SendPaymentResult =
  | { ok: true; txHash: string; resultCode: 'tesSUCCESS' }
  | { ok: false; reason: 'ledger_rejected' | 'unconfirmed' | 'network_error' | 'invalid_input';
      resultCode?: string; txHash?: string; error: string };

export function sendPayment(input: SendPaymentInput): Promise<SendPaymentResult>;
export function getRlusdBalance(xrplAddress: string): Promise<number>;
export function getPaidToday(xrplAddress: string): Promise<number>;
export function getAgentAddress(): string;   // for the bypass test
```

What each failure reason means for the caller:

- `ledger_rejected`: the ledger refused the payment. Nothing was paid.
- `network_error`: nothing was paid (never submitted, or it expired without
  applying). Safe to retry.
- `unconfirmed`: submitted but not confirmed yet, `txHash` included. It may
  still succeed, so do not mark the claim failed. Call `sendPayment` again
  with the same `decisionId` to re-check the ledger without sending anything
  new.
- `invalid_input`: bad amount or address. Nothing was sent.

Rules agreed with the owner:

- `recipient` is sent exactly as given. The module only checks that it is a
  valid address format and never swaps or blocks it. The bypass test relies
  on this: it sends the attacker's address and expects the ledger to reject
  the overspend.
- `sendPayment` never throws, even on a bad config, and never pays twice for
  the same `decisionId`. Repeat calls reuse the first result, including when
  two calls arrive at once and after a server restart (it searches the agent
  wallet's ledger history for the decision ID memo before sending).
- "Today" for `getPaidToday` is the UTC calendar day. This matches the
  database, whose timestamps are UTC, and the ledger's close times. Note that
  UTC midnight is 8 PM New York time (7 PM in winter), so the daily cap
  resets in the evening local time.
- Fake mode behaves the same way, including the 10 RLUSD agent allowance and
  ledger-style rejections.

## 7. Two habits that prevent hard-to-find bugs

- **Wrap every async route handler in `asyncHandler`** (`src/routes/asyncHandler.ts`).
  Express 4 does not catch errors from async handlers. Without the wrapper, one
  unexpected error, such as the XRPL or Solana connection dropping, ends the whole
  server and the request never gets an answer. With it, that request gets a clean
  500 and the server keeps running. Any route that reads a network or the
  database needs it.
- **Do not check database errors with `.rejects.toThrow()` in tests.** When test
  files share a worker, the database library's errors are not always recognized as
  `Error` objects, so the test passes or fails depending on test order. Catch the
  error and check its `message` instead.
