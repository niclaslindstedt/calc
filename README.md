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

- **Display** — the result leads, big, with the expression it came from
  underneath it. Characters reveal one at a time as they are typed, sliding
  in from the right while the line settles left of them, and operators set
  as bordered accent chips with room either side — `1 + 2` reads as two
  values with an operation between them, the way it sits on the keypad. A
  square root reads as the key that typed it: `sqrt(9)` is stored as the word
  the evaluator parses but set as an accented `√(9)`, in the display and on
  the tape alike. An
  expression
  mid-thought (`12+`) keeps the last real answer up, dimmed, rather than
  blanking the headline; the hex spelling and any error read on a thin line
  below.
- **Sessions** — the left sidebar lists saved sessions. A new tape is
  scratch: it is not a file until you press the disk icon, which names it
  (notes-style: the title field is selected, ready to be overwritten) and
  writes it to storage. Not a file is not the same as not kept — the tape you
  are working on stays on this device and is still there when you come back,
  backend or no backend, until you clear it yourself. Opening a session
  resumes its tape _and_ the mode it was last used with.
- **Tape** — always in view above the display, showing the last few entries.
  It scrolls at any size. Each entry reads result-first with the expression
  under it and a star in the left gutter for the rows worth finding again.
  Tap an entry to copy its value; long-press to copy the expression — on an
  entry that continued from the one above, the long press offers its own
  expression or the whole chain folded into one bracketed expression.
  Left-swipe — or right-click, on a desktop pointer — reveals the note and
  delete actions. Every copy confirms with a brief label over the value it
  took.
- **Resizing the tape** — drag the tape itself, or the hairline handle
  between it and the display, and the tape takes whatever share you leave it
  at. Drag it nearly shut and the tape falls back to its resting height; drag
  it past the point where the display and the keys still fit and the
  calculator slides off the bottom rather than being squeezed, until the tape
  has the whole screen with the handle parked at the bottom — a drag up
  anywhere on the tape brings the calculator back. Let go with the calculator
  half covered and the tape settles on whichever end is nearer. Where the
  tape has entries to scroll, the list keeps the drag until it reaches one of
  its ends. Clicking the handle toggles, and the arrow keys step it. Swiping
  the display down and up steps the tape open and shut (Settings → General).
- **Brackets** — a bracket left open at the end closes itself. `sqrt(3`,
  `sin(2` and `(25+3)*(5+1` all answer as written, and what the tape records
  is the finished expression (`sqrt(3)`), so it re-reads and re-evaluates
  like every other entry. A `)` that never had an opener is still an error —
  that one is a mistake, not an omission.
- **Clipboard** — press and hold the display to raise a twin pill over it:
  **Copy** takes the expression (or the number) currently on the display,
  **Paste** puts the clipboard on it. Paste reads what it can — an
  expression or number the calculator understands goes in as it stands, and
  anything else gives up its first number instead (`Total: $1,234.56` pastes
  `1234.56`), so the half stays dark only when there is no number to find.
  What lands is typed onto the expression exactly as the keypad would type
  it, so it continues a half-written calculation rather than replacing it.
- **Erasing** — one key does all of it. With something on the display it
  reads `⌫`: tap takes back a character, hold wipes the whole expression.
  With the display empty it reads `C`, a tap does nothing (there is nothing
  to erase), and a hold clears the session's tape after confirming.
- **Modes** — the top-bar buttons switch the layout: basic (`123`),
  scientific (`sin`), programmer (`0x`). The basic pad is the digits with the
  operators down its right-hand edge (`+` drawn tall over the bottom two
  rows), a row of `±`, `(`, `)` and `√` above them, and erase and `=` along
  the foot. `±` flips the sign of the value the display ends on — press it
  again and the sign comes back off. Settings → Layouts enables or
  disables modes, trims each mode's buttons, and creates new modes: pick a
  base layout, press the buttons you want gone, name it.
- **Folders & namespaces** — the sidebar's folder button creates folders
  (one level, like the notes sibling app); the namespace switcher on top
  swaps whole workspaces, each with its own directory in storage.
- **Keyboard** — digits, operators and names type straight in, and the
  operators land as the glyphs the keys draw: a typed `*`, `/` and `-` go on
  the display as `×`, `÷` and `−`, so an expression reads the same — and its
  operator chips frame the same signs — whichever way it was entered. A
  keyboard types into the calculator rather than into the pad in front of it,
  so
  `sqrt(2)+sin(0)` works on the basic pad exactly as it does on the
  scientific one — the layouts decide which keys are worth a thumb, not which
  expressions the calculator understands. `Enter` is `=`, `Backspace`
  deletes, and `Escape` or `Delete` clears; a shifted `C` clears too, except
  on the programmer pad where `C` is the hex digit. (Plain `c` types, since
  it opens `cos(`, `ceil(` and `cbrt(`.) Every keystroke lights the button
  that answered it — the cap dips, its glyph takes the accent, and a soft
  halo fades out — so typing is felt on the pad the way tapping is; a typed
  name this pad has no cap for simply lands on the display.
- **Opening the sidebar** — on a phone it is one of two, your pick in
  Settings → General: the draggable floating button (drag it to either edge,
  at any height), or an inward swipe from the edge the button rests against.
  A wide screen docks the sidebar and uses neither.
- **Hiding the sidebar** — on a docked (wide-screen) sidebar, a chevron grip
  rides its inner edge and folds the whole panel away, handing its width to
  the calculator; it is invisible until the pointer comes to that edge, and
  once collapsed it waits at the screen edge to bring the panel back. A
  second chevron rail just above the footer folds About and Settings away, so
  the session list gets those rows instead. Both choices are remembered per
  device.
- **Text sizes** — Settings → Appearance sizes both surfaces (Small /
  Medium / Large / Huge, each with a live preview): the display's result and
  expression, which step together so the result stays the headline, and the
  keypad's button labels, where the keys keep their size and only the text
  grows.
- **Settings** — the sidebar footer opens it: General (gestures, sidebar),
  Layouts, Appearance (display and button text sizes + theme), and Storage,
  which is where a backend is connected. Changes are staged and applied with Save;
  Cancel puts everything back. The footer also carries an About entry with
  the build identifier.
- **Storage** — Settings → Storage picks between _Device_ (the working tape
  stays on this device and nothing else leaves it), a local _Folder_,
  _Dropbox_, and Google _Drive_. Every option is
  listed whether or not this browser and build can reach it, and picking an
  unreachable one says what it needs. Connecting or disconnecting applies at
  once — it is not staged behind Save.

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
