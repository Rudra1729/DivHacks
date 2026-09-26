# Contributing Rules

These are the rules for this repo. Follow them for every commit and PR.

## Quick reference

1. No AI authorship on commits or PRs.
2. Simple, plain commit messages, no em dashes.
3. PR descriptions detailed enough to review without reading the diff.
4. Google-style docstrings on all functions, classes, and modules.

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

## 3. Detailed PR descriptions

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

## 4. Docstrings: Google style (Napoleon)

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
