# Contributing Rules

These are the rules for this repo. Follow them for every commit and PR.

## Quick reference

1. No AI authorship on commits or PRs.
2. Simple, plain commit messages, no em dashes.
3. Commit frequently enough. Don't push a big feature all together.
4. PR descriptions detailed enough to review without reading the diff.
5. Google-style docstrings on all functions, classes, and modules.
6. Agree on hand-off contracts in chat before coding against them.

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

export type MintStampResult =
  | { ok: true; assetAddress: string; signature: string }
  | { ok: false; error: string };

export function mintStamp(input: MintStampInput): Promise<MintStampResult>;
export function hasStampForPlace(solanaAddress: string, placeId: string): Promise<boolean>;
export function getStamps(solanaAddress: string): Promise<Stamp[]>;
```

Open item: ask Junaid for the metadata URL pattern (for example
`GET /metadata/:decisionId`). Until he answers, use a `METADATA_BASE_URL`
env var.
