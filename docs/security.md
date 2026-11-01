# Security design

Crate Bridge opens files from drives and libraries you point it at, so its main job is to treat those files as
untrusted and to never send anything anywhere.

> Vibe-coded with Claude Code; reviewed only lightly. This document describes the *design* and what is
> automatically checked, not a formal audit.

## Threat model

| Concern | Example | Control |
|---|---|---|
| Data leaves your machine | Analytics, a CDN script, a font request | Content-Security-Policy `default-src 'none'; connect-src 'none'`; zero dependencies; `npm run lint` fails on any external URL or network call |
| Malicious library file | A USB with a playlist named `<img src=x onerror=…>` | Every library-derived string goes through `esc()` before it is placed in HTML; CSP blocks inline script anyway (defence in depth) |
| Path tricks | A playlist or file named `..` or `a/../../x` | Names are sanitised by `clean()`, the browser's folder API refuses `..`, and writes only ever go inside the destination you chose |
| Hostile or corrupt binary | A truncated `export.pdb` that loops forever | Page walks are cycle-checked and row counts are bounded; fuzz tests assert the parsers terminate |
| Code injection | `eval`, `new Function`, inline handlers | Banned by CSP and by lint |
| Clickjacking | The page embedded in a hostile frame | `boot.js` hides the page when framed (static hosts cannot send `frame-ancestors`) |
| Supply chain | A compromised npm package or CDN | There are none. CI actions are pinned to commit SHAs and updated by Dependabot |
| Accidental data loss | Overwriting a library | Originals are only read. Existing Serato crates are never overwritten (new ones get a suffix). Dry-run mode available |

## Permissions

The browser asks you to pick each folder and shows what access is granted. Crate Bridge asks for **write** access
only to the destination you pick and, when you ask for Serato crates, to your `_Serato_` folder at that moment.
It stores nothing between visits (no cookies, local storage or IndexedDB).

## Content-Security-Policy

```
default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data:; font-src 'self';
connect-src 'none'; base-uri 'none'; form-action 'none'; object-src 'none'
```

Delivered as a `<meta>` tag (GitHub Pages cannot set headers). `data:` images are the favicon and a select arrow.
If you host Crate Bridge elsewhere, send the same policy as a real header and add
`frame-ancestors 'none'`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer` and a restrictive
`Permissions-Policy`.

## Verify it yourself

1. Open DevTools → **Network** and use every tool: you should see only the page's own files, nothing else.
2. Open DevTools → **Console**: there should be no "violates the Content Security Policy" messages.
3. `npm run lint && npm test`.

## Known gaps and ideas

- **Trusted Types** (`require-trusted-types-for 'script'`) is not enabled because the UI still assigns HTML strings.
  Moving to DOM-building helpers would allow it.
- The file parsers are fuzzed with random data, not with a corpus of real corrupted exports.
- Serato crate paths on external drives are written as absolute paths without a leading slash; Serato's behaviour
  for other drives is unverified.
- Outdated-dependency checks only cover what exists (CI actions, Node, devDependencies); the shipped site has no libraries.

## Repository hygiene checklist (maintainers)

Settings that cannot be set from code — turn these on in *Settings*:

- [ ] **Two-factor authentication** and, ideally, passkeys for every maintainer.
- [ ] **Branch protection** on `main`: require pull requests, the `CI` checks and conversation resolution; block force-pushes.
- [ ] **Code security**: enable Dependabot alerts and security updates, secret scanning and **push protection**, code scanning (CodeQL workflow is included), and **private vulnerability reporting**.
- [ ] **Actions → General**: set the default `GITHUB_TOKEN` to read-only and enable *Require actions to be pinned to a full-length commit SHA*.
- [ ] **Pages** (at release): deploy from the *GitHub Actions* source and add required reviewers to the `github-pages` environment.
- [ ] Require signed commits (optional but nice) and review who has write access regularly.
