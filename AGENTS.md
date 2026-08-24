# AGENTS.md

Guidance for AI coding agents working in this repository. `CLAUDE.md`,
`GEMINI.md`, `.cursorrules`, `.windsurfrules`, and
`.github/copilot-instructions.md` are symlinks to this file (OSS_SPEC §7.1).

## What this is

Calc — a local-first calculator PWA built on
`@niclaslindstedt/oss-framework` (Preact + Vite 8 + Tailwind v4). Sessions
(calculator tapes with per-entry notes) save as markdown files with YAML
front matter to a local folder, Dropbox, or Google Drive. localStorage holds
settings only, never documents.

## Build and test commands

```sh
make install    # npm install — needs a GitHub Packages token, see below
make build      # vite build
make test       # vitest run (tests/*_test.ts, node environment)
make lint       # eslint . && tsc --noEmit
make fmt        # prettier --write .
make fmt-check  # prettier --check .
make icons      # regenerate public/icons + og.png from the mark geometry
make check-seo  # build + structural SEO assertions over dist/
```

`@niclaslindstedt/oss-framework` resolves from GitHub Packages, which needs
auth even for public reads: `//npm.pkg.github.com/:_authToken=<token>` in
`~/.npmrc` (`read:packages` scope). Claude Code web sessions get this wired
automatically by `.claude/hooks/session-start.sh`.

Run a single test file: `npx vitest run tests/evaluator_test.ts`.

## Commit and PR conventions

- Conventional commits (`feat(scope): …`, `fix: …`, `<type>!:` for breaking).
- Squash-merge; the PR title becomes the commit on `main`, so it must be
  conventional-commit format too.
- User-visible changes need a changelog fragment under `.changes/unreleased/`
  (front matter: `type: Added|Changed|Fixed|Removed|Security|Deprecated`,
  optional `breaking: true`); CI's `changeset` job enforces this. Pure
  refactors/CI/docs are exempt (skip-list in
  `scripts/release/check-changeset.mjs`), or label the PR `no-changelog`.
- Never hand-edit released CHANGELOG.md sections — the Release workflow
  generates them from the fragments.

## Architecture summary

One Preact app, no router. `src/main.tsx` renders `src/App.tsx`, which owns
the theme, the sidebar shell, the top bar (session title, mode buttons, the
disk-save icon), and the modal siblings. State is hooks, not stores:

- `useSessions(namespaceSlug)` — the document state: the active (possibly
  scratch) session, saved sessions + folders loaded from the storage
  backend, and every session/folder action. Debounced write-through for
  saved sessions; scratch sessions are memory-only until the disk icon.
- `useAppSettings()` — localStorage settings: gestures, key animation,
  enabled modes, per-mode hidden keys, custom modes.
- `useNamespaces()` — the framework's namespace registry in localStorage.

Pure domain modules (unit-tested, DOM-free): `evaluator.ts` (tokenizer +
recursive-descent parser over one shared grammar for all modes),
`session.ts` (the Session/Entry/Folder model), `codec.ts` (markdown + YAML
front matter serialization, filenames, directory layout), `modes.ts` (keypad
layout definitions and custom-mode resolution).

Storage: `store.ts` builds a framework `FileStore` (folder / Dropbox /
Drive) and binds it to sessions via `createSessionStore` — one markdown file
per session under `calculations/` (namespaces prefix `<slug>/`), plus a
`folders.json` registry. See `docs/architecture.md` and
`docs/storage-format.md`.

## Where new code goes

| Change                         | Location                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| New operator / function        | `src/app/evaluator.ts` + evaluator tests                                                     |
| New keypad key / layout / mode | `src/app/modes.ts`                                                                           |
| Session model change           | `src/app/session.ts` + `codec.ts` (+ migration note in docs/storage-format.md)               |
| File-format change             | `src/app/codec.ts` + `tests/codec_test.ts` + `docs/storage-format.md` + `examples/`          |
| New storage backend            | `src/app/store.ts` (FileStore factory)                                                       |
| New screen / modal             | `src/app/<Name>.tsx`, wired in `App.tsx`                                                     |
| Settings key                   | `src/app/useAppSettings.ts` + Settings UI                                                    |
| Build/deploy behavior          | `vite.config.ts` / `pwa-plugin.ts` / `.github/workflows/`                                    |
| Icon / mark change             | `public/icons/icon.svg` + `scripts/generate-icons.mjs` (keep in lockstep), then `make icons` |

## Test conventions

Tests live flat in `tests/` with the OSS_SPEC §20.2 `_test.ts` suffix, run
by vitest in the `node` environment (`vitest.config.ts` — no DOM, no
rendering). They cover the pure domain modules; UI changes are verified by
`npm run build && npm run preview` and clicking through a calculation ending
in `=`. No test-specific dependencies beyond vitest.

## Documentation sync points

| When you change…             | Also update…                                                      |
| ---------------------------- | ----------------------------------------------------------------- |
| The file format (codec.ts)   | `docs/storage-format.md`, `examples/`, `public/llms.txt`          |
| Keypad layouts / modes       | README **Usage**, `docs/getting-started.md`                       |
| Env vars (`vite-env.d.ts`)   | `.env.example`, `docs/configuration.md`, README **Configuration** |
| Storage backends             | `docs/architecture.md`, `docs/configuration.md`                   |
| localStorage keys            | `docs/architecture.md` (key inventory)                            |
| The public surface generally | Run the `update-readme` / `update-docs` skills (`.agent/skills/`) |

## Parity and cross-cutting rules

- `public/icons/icon.svg` and `scripts/generate-icons.mjs` describe the same
  geometry — change both together, then `make icons`.
- `src/app/pwa.ts` (`cacheIdForBase`) is imported by both the app and
  `pwa-plugin.ts`; it must stay dependency-free.
- Every mode feeds the same evaluator grammar: never add a key whose stored
  expression text another mode cannot re-evaluate.
- localStorage is for settings/pointers only (`calc:*` keys); session
  documents go through the storage backend. Do not add document data to
  localStorage.
- The serialize → parse → serialize round trip must stay byte-identical
  (`tests/codec_test.ts` enforces it); entry ids are derived on parse, never
  stored.

## Website staleness

The app is the website: `pages.yml` builds it per channel and deploys
`dist/` (OSS_SPEC §11.2 applies in PWA form). SEO surfaces live in
`index.html` (head), `public/` (`robots.txt`, `sitemap.xml`, `llms.txt`,
`og.png`), and `scripts/check-seo.mjs` asserts them post-build — keep them
in sync with user-visible features.

## Maintenance skills

`.agent/skills/` ships (registry + run order in
`.agent/skills/maintenance/SKILL.md`):

- `maintenance` — umbrella: detects which sync skills are stale and runs them.
- `update-docs` — sync `docs/*.md` after behavior changes.
- `update-readme` — sync `README.md` after public-surface changes.
