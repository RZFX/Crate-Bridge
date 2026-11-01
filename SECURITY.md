# Security policy

Crate Bridge is a client-side tool that reads and writes files in folders **you** choose. It makes no network
requests and has no server component, so most of its security story is about *not* doing things:
see [docs/security.md](docs/security.md) for the design and how to verify it yourself.

> **Vibe-coded software.** Crate Bridge was built with Claude Code and has had limited review. Treat it accordingly:
> keep backups of your libraries and try new features on a copy first.

## Reporting a vulnerability

Please report security problems **privately**, not as a public issue:

1. Open a [private security advisory](https://github.com/RZFX/Crate-Bridge/security/advisories/new), or
2. if that is unavailable, contact the maintainer through their GitHub profile.

Include what you did, what you expected, what happened, and (if possible) a small sample file that triggers it.
Never send music or whole libraries. This is a hobby project: reports are handled on a best-effort basis, without
guaranteed response times, but real vulnerabilities will be fixed and credited if you wish.

## What counts

- A way for a crafted Rekordbox/Serato file (or filename) to run script in the page, write outside the chosen folders, or crash/hang the tab.
- Any network request, third-party script or data leaving the browser.
- A change that weakens the Content-Security-Policy.
- Problems in the build/CI configuration (for example, unpinned or over-privileged workflows).

## What doesn't

- Bugs that only cause wrong output (cues in the wrong place, missing tracks): please file a normal bug report.
- Anything that requires an attacker who already controls your computer or browser.

## Supported versions

Only the latest release on `main` is supported.
