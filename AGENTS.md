# AGENTS.md

Guidance for AI coding agents working in this repository. `CLAUDE.md`,
`GEMINI.md`, `.cursorrules`, `.windsurfrules`, and
`.github/copilot-instructions.md` are symlinks to this file (OSS_SPEC §7.1).

## What this is

Calc — a local-first calculator PWA built on
`@niclaslindstedt/oss-framework` (Preact + Vite 8 + Tailwind v4). Sessions
(calculator tapes with per-entry notes) save as markdown files with YAML
front matter to a local folder, Dropbox,. localStorage holds
settings only, never documents; the unsaved working tape is mirrored into
IndexedDB (`scratch.ts`) so history survives a reload with no backend.

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

The native wrapper in `native/` has a **dependency tree of its own** — `make
install` does not touch it, and neither does `npm ci` at the root:

```sh
make native-install    # npm --prefix native install
make native-bundle     # build the web app into native/assets/webroot.zip
make native-typecheck  # the wrapper's own tsc
make native-prebuild   # inspect what the config plugin generates
```

The desktop shell in `tauri/` is a Rust project with its own toolchain; `make
test` and `make lint` stop at its edge:

```sh
make tauri                # bundle the site into the shell and run the desktop app
make tauri-test           # its decision layer (cargo test -p calc-shell — no GUI libs)
make tauri-lint           # clippy at zero warnings, both crates
make tauri-fmt            # rustfmt in place (tauri-fmt-check verifies)
make tauri-package        # this machine's installers
make tauri-package-debug  # …debug profile: minutes faster, much bigger
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
the theme, the sidebar shell, the top bar (session title, mode buttons, save
status), and the modal siblings. State is hooks, not stores:

- `useSessions(namespaceSlug)` — the document state: the active (possibly
  scratch) session, saved sessions + folders loaded from the storage
  backend, and every session/folder action. A session becomes a file the
  moment it is named — there is no save button — after which `=` writes it
  through immediately and slower edits debounce; an unnamed tape is not a
  file, but it is mirrored to the device (`scratch.ts`) and read back on the
  next visit.
- `useAppSettings()` — localStorage settings: gestures, key animation,
  enabled modes, per-mode hidden keys, custom modes.
- `useNamespaces()` — the framework's namespace registry in localStorage.

Pure domain modules (unit-tested, DOM-free): `session.ts` (the
Session/Entry/Folder model), `codec.ts` (markdown + YAML front matter
serialization, filenames, directory layout), and `modes.ts` (keypad layout
definitions and custom-mode resolution).

The arithmetic itself is **not** app code any more. The evaluator, the
reading of an expression (operator chips, symbol functions, bracket depth),
the chain fold and the clipboard candidate all live in the framework's
`expression` module, and the two renderers (`RevealText`, `ExpressionText`)
come from there with their paint (`.oss-expr-*`, in the framework
stylesheet). A grammar change is a framework change now — one grammar, and
every mode still shares it.

Storage: `store.ts` builds a framework `FileStore` (folder / Dropbox /
iCloud Drive) and binds it to sessions via `createSessionStore` — one markdown file
per session under `calculations/` (namespaces prefix `<slug>/`), plus a
`folders.json` registry. `scratch.ts` is the device floor under that: the
working tape as one IndexedDB record per namespace, in the same markdown the
backends hold. See `docs/architecture.md` and `docs/storage-format.md`.

### The desktop shell wraps this app — it does not extend it

`tauri/` is a **thin** [Tauri](https://tauri.app) wrapper: a window, the built
site served from a private `calc://` scheme, and one capability a page cannot
have — the loopback listener that lets Dropbox sign in
(`tauri/shell/src/oauth.rs`, `tauri/src-tauri/src/loopback.rs`). **The page is
never told it is inside it** — no injected global, no Tauri command, and a
permission list holding only Tauri's own minimum. It is two Rust crates:
`tauri/shell/` holds every decision and needs no GUI toolkit (so `make
tauri-test` runs on a bare runner), `tauri/src-tauri/` holds every effect.

One seam reaches back into this tree, `VITE_SHELL_BUILD`: the shell's site
build passes it, which switches off the service-worker half of `appPwa` and —
through `__SHELL_BUILD__` — the in-app update prompt. A desktop build has no
deploy to notice; a new version arrives as a new binary. The package's name
and identifier come from `APP_DISPLAY_NAME` and `APP_BUNDLE_ID` at packaging
time (`tauri/scripts/package.mjs`), like the phone app's. See
[`tauri/README.md`](tauri/README.md).

### The native wrapper is optional, and outside all of this

`native/` is a thin Expo / React Native shell that bundles this web build and
serves it in a `WebView`, so the app can ship to the App Store and Google Play.
It is a **separate npm project** with its own lockfile, its own `tsc`, and no
share of the root's dependency tree.

Two rules keep it thin:

1. **Nothing in `src/` may learn that the wrapper exists.** The web app asks
   whether a _capability_ is present (`src/app/icloudHost.ts` looks for an
   iCloud provider on `window`), never whether it is running natively. A
   browser has no provider and the iCloud option says so.
2. **The wrapper owns no domain.** It moves opaque files between the page and a
   folder in iCloud Drive. Session paths, the codec and when a save is due stay
   in `src/app/`.

A root test (`tests/native_icloud_test.ts`) imports one module from that tree
to pin the two sides of the seam against each other — which is why
`native/src/icloudBridge.ts` takes its types from the import-free
`native/src/icloudWire.ts`. See [`native/README.md`](native/README.md).

## Where new code goes

| Change                         | Location                                                                                     |
| ------------------------------ | -------------------------------------------------------------------------------------------- |
| New operator / function        | the framework's `expression` module — not this repo                                          |
| New keypad key / layout / mode | `src/app/modes.ts` (the key's stored text must parse in the framework's one grammar)         |
| Session model change           | `src/app/session.ts` + `codec.ts` (+ migration note in docs/storage-format.md)               |
| Expression-chain rule          | the framework's `expression` module — not this repo                                          |
| File-format change             | `src/app/codec.ts` + `tests/codec_test.ts` + `docs/storage-format.md` + `examples/`          |
| New storage backend            | `src/app/store.ts` (FileStore factory)                                                       |
| Native wrapper                 | `native/...` (a separate npm project — see above)                                            |
| Desktop shell                  | `tauri/shell/` if it is a decision, `tauri/src-tauri/` if it is an effect                    |
| Device-local persistence       | `src/app/scratch.ts` (IndexedDB) — never localStorage                                        |
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
| The native wrapper           | `native/README.md`, `native/RELEASING.md`                         |
| The desktop shell            | `tauri/README.md`, `docs/desktop-app.md`, `tauri/shell/tests/`    |
| localStorage keys            | `docs/architecture.md` (key inventory)                            |
| The public surface generally | Run the `update-readme` / `update-docs` skills (`.agent/skills/`) |

## Parity and cross-cutting rules

- `public/icons/icon.svg` and `scripts/generate-icons.mjs` describe the same
  geometry — change both together, then `make icons`. `native/assets/*.png`
  and `tauri/src-tauri/icons/*` are generated by the same script.
- The iCloud container id is pinned in `native/identifiers.js` (which the
  config and its plugins read) and in `native/modules/icloud-store/` (index.ts
  and its Swift twin), which must agree. Changing it after release strands
  every synced copy in the old container.
- The iCloud bridge's property and event names are a contract between
  `native/src/icloudBridge.ts` and `src/app/icloudHost.ts`.
  `tests/native_icloud_test.ts` pins them.
- `src/app/pwa.ts` (`cacheIdForBase`) is imported by both the app and
  `pwa-plugin.ts`; it must stay dependency-free.
- Every mode feeds the framework's one expression grammar: never add a key
  whose stored expression text another mode cannot re-evaluate.
- localStorage is for settings/pointers only (`calc:*` keys); session
  documents go through the storage backend, and the one device-local
  document — the unsaved working tape — goes through `scratch.ts`
  (IndexedDB). Do not add document data to localStorage.
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
