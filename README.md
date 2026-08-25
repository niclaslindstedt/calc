# calc

> A local-first calculator PWA with named, commentable sessions — built on
> [`@niclaslindstedt/oss-framework`](https://github.com/niclaslindstedt/oss-framework).

[![ci](https://github.com/niclaslindstedt/calc/actions/workflows/ci.yml/badge.svg)](https://github.com/niclaslindstedt/calc/actions/workflows/ci.yml)
[![release](https://github.com/niclaslindstedt/calc/actions/workflows/release.yml/badge.svg)](https://github.com/niclaslindstedt/calc/actions/workflows/release.yml)
[![pages](https://github.com/niclaslindstedt/calc/actions/workflows/pages.yml/badge.svg)](https://github.com/niclaslindstedt/calc/actions/workflows/pages.yml)
[![spec](https://img.shields.io/badge/OSS__SPEC-v2.8.0-blueviolet)](OSS_SPEC.md)
[![license](https://img.shields.io/badge/license-PolyForm--NC--1.0.0-blue.svg)](LICENSE)

## What

Calc is a calculator that treats a computation as a document. Every
calculation that ends with `=` lands on the session's tape, which stays in
view above the keys; tape entries can be starred and can carry notes
explaining _why_ a number is what it is; and a session — tape, notes, and
the keypad layout it was last used with — saves as a plain
markdown file you can read anywhere. Sessions organize into folders and
namespaces from the left sidebar, and layouts (basic, scientific,
programmer, or modes you define yourself) are per-session and customizable
down to the individual button.

## Why

- **A tape you can annotate.** A calculator result without context dies in
  seconds. Left-swipe an entry, attach a note, star the rows that matter,
  and the calculation still makes sense next month.
- **Chains you can copy.** Keep building on a result without pressing `C`
  and the run folds back into one expression: `1+2 = 3`, then `3*2 = 6`,
  copies as `(1+2)*2` — brackets added only where the grammar needs them.
- **Files, not databases.** Sessions are markdown with YAML front matter in
  a folder you own — local or cloud — diffable, greppable, future-proof.
- **Your layout.** Hide the buttons you never press, or build a mode of your
  own from a base layout and name it.
- **Local-first.** No account, no server. localStorage holds settings only;
  documents live where you point them.

## Prerequisites

- Node.js ≥ 22 (CI pins 24 — see `.nvmrc`), npm ≥ 10
- A GitHub personal access token with `read:packages` in `~/.npmrc` — the
  `@niclaslindstedt/oss-framework` dependency resolves from GitHub Packages:

  ```
  //npm.pkg.github.com/:_authToken=<your read:packages token>
  ```

## Install

```sh
git clone https://github.com/niclaslindstedt/calc.git
cd calc
npm install
```

Or just use the hosted app at <https://calc.niclaslindstedt.se/> — it
installs as a PWA and works offline.

## Quick start

```sh
npm run dev
```

Open the printed URL, type `12 × 4.5` and press `=` — the calculation lands
on the tape above the display. Press the disk icon in the top bar to name
and keep the session.

## Usage

- **Sessions** — the left sidebar lists saved sessions. A new tape is
  scratch: it lives in memory until you press the disk icon, which names it
  (notes-style: the title field is selected, ready to be overwritten) and
  writes it to storage. Opening a session resumes its tape _and_ the mode it
  was last used with.
- **Tape** — always in view above the display, showing the last few entries;
  swipe down on the display (or press the History handle) to expand it to
  half the screen. It scrolls either way. Each entry reads result-first with
  the expression under it and a star in the left gutter for the rows worth
  finding again. Tap an entry to copy its value; long-press to copy the
  expression — on an entry that continued from the one above, the long press
  offers its own expression or the whole chain folded into one bracketed
  expression. Left-swipe to reveal the note and delete actions. Every copy
  confirms with a brief label over the value it took.
- **Modes** — the top-bar buttons switch the layout: basic (`123`),
  scientific (`sin`), programmer (`0x`). Settings → Layouts enables or
  disables modes, trims each mode's buttons, and creates new modes: pick a
  base layout, press the buttons you want gone, name it.
- **Folders & namespaces** — the sidebar's folder button creates folders
  (one level, like the notes sibling app); the namespace switcher on top
  swaps whole workspaces, each with its own directory in storage.
- **Keyboard** — digits and operators type straight in; `Enter` is `=`,
  `Backspace` deletes, `Escape` clears.
- **Settings** — the sidebar footer opens it: General (gestures), Layouts,
  Appearance, and Storage, which is where a backend is connected. Changes
  are staged and applied with Save; Cancel puts everything back. The footer
  also carries an About entry with the build identifier.

## Configuration

All configuration is optional — see [`docs/configuration.md`](docs/configuration.md)
for the full list. Build-time env (`.env`, see `.env.example`):

| Variable                  | Effect                                            |
| ------------------------- | ------------------------------------------------- |
| `VITE_DROPBOX_APP_KEY`    | Enables the Dropbox backend in Settings → Storage |
| `VITE_GOOGLE_CLIENT_ID`   | Enables the Google Drive backend                  |
| `VITE_DROPBOX_APP_FOLDER` | Dropbox app-folder name (default `Calc`)          |
| `VITE_GDRIVE_APP_FOLDER`  | Drive folder name (default `Calc`)                |

## Examples

A saved session file (see [`examples/`](examples/) and
[`docs/storage-format.md`](docs/storage-format.md)):

```markdown
---
type: calculation
id: 0198c9c9-aaaa-bbbb-cccc-00000a1b2c3d
created: 2026-08-24T09:00:00.000Z
updated: 2026-08-24T09:05:00.000Z
folder: f-shopping
---

# Groceries budget

- `12 × 4.5` = `54` _(at 2026-08-24T09:01:00.000Z)_
  Twelve packs at 4.50 each
- `54 + 12.9` = `66.9` _(at 2026-08-24T09:02:00.000Z)_
```

## Troubleshooting

- **`npm install` fails with 401/404 on `@niclaslindstedt/oss-framework`** —
  GitHub Packages needs auth even for public reads; add the `_authToken`
  line above to `~/.npmrc`. See [`docs/troubleshooting.md`](docs/troubleshooting.md).
- **"Local folder…" is missing from Settings → Storage** — the File System
  Access API is Chromium-only; use a cloud backend elsewhere.
- **Nothing saves** — a scratch session is intentional: connect a backend in
  Settings → Storage, then press the disk icon.

## Documentation

- [`docs/getting-started.md`](docs/getting-started.md)
- [`docs/architecture.md`](docs/architecture.md)
- [`docs/configuration.md`](docs/configuration.md)
- [`docs/storage-format.md`](docs/storage-format.md)
- [`docs/troubleshooting.md`](docs/troubleshooting.md)

## Contributing

See [`CONTRIBUTING.md`](CONTRIBUTING.md). Bugs and feature requests go to
[GitHub Issues](https://github.com/niclaslindstedt/calc/issues); security
reports go through [`SECURITY.md`](SECURITY.md) — never public issues. This
repository follows [`OSS_SPEC.md`](OSS_SPEC.md).

## License

[PolyForm Noncommercial 1.0.0](LICENSE) © Niclas Lindstedt
