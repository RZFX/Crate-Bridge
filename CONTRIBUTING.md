# Contributing

Thanks for helping! Crate Bridge is a small, dependency-free project; please keep it that way.

## Ground rules

1. **No runtime dependencies and no network access.** The page must work offline and never load third-party code. `npm run lint` and the Content-Security-Policy enforce this.
2. **No inline code.** No inline `<script>`, `style=""` attributes or `on…=` handlers: the CSP blocks them. Use classes and `addEventListener`.
3. **Escape everything that comes from a library.** Playlist and track names are untrusted input: pass them through `esc()` before putting them into HTML.
4. **Never modify originals.** Writing happens only to the destination the user picked.
5. **Be honest in the UI.** If something is unverified or lossy, say so.

## Setup

You need Node 22 or newer (see `.nvmrc`).

```bash
git clone https://github.com/RZFX/Crate-Bridge.git
cd Crate-Bridge
npm start          # http://localhost:8765
npm run check      # lint + tests
```

There is no build step: `index.html`, `css/` and `js/` are served as they are.

## Tests

- `npm test` runs the unit and fuzz tests in `test/*.test.mjs` (Node's built-in runner).
- `test/manual/` holds scripts that need a real Rekordbox USB or audio file (`pdb.mjs`, `embed.mjs`, `restore-e2e.mjs`). They are not run in CI. Please run them if you touch the parsers or the restore engine.
- When you fix a bug, add a test that fails without the fix.

## Pull requests

- Keep them focused; describe what you tried in a browser.
- Match the surrounding style (see `.editorconfig`). No formatter is enforced.
- Update `CHANGELOG.md` for user-visible changes.

## File-format notes

If you reverse-engineer more of the Rekordbox or Serato formats, document them in [docs/architecture.md](docs/architecture.md) and credit your sources.
