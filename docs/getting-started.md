# Getting started

Calc is a local-first calculator PWA: calculations run in named sessions,
every `=` lands on a commentable tape, and sessions save as markdown files
to storage you own.

## Run the hosted app

Open <https://calc.niclaslindstedt.se/>. It installs as a PWA (browser menu
→ _Install app_) and works offline after the first visit.

## Run from source

Prerequisites: Node.js ≥ 22, npm ≥ 10, and a GitHub personal access token
with `read:packages` in `~/.npmrc` (the framework dependency resolves from
GitHub Packages — see [troubleshooting](troubleshooting.md) if `npm install`
returns 401/404):

```
//npm.pkg.github.com/:_authToken=<token>
```

Then:

```sh
git clone https://github.com/niclaslindstedt/calc.git
cd calc
npm install
npm run dev
```

## First session

1. Type a calculation — keypad or hardware keyboard — and press `=`. The
   entry lands in the history; swipe down on the display (or press the
   History handle) to see the tape.
2. Press a tape entry's note button (left gutter, or left-swipe the row)
   and write down _why_ this calculation exists. Tap an entry to copy its
   value; long-press to copy the expression.
3. Press the **disk icon** in the top bar. If no storage backend is
   connected yet, Settings → Storage opens — pick a local folder (Chromium)
   or a cloud backend. The session gets a suggested name with the title
   field selected, ready to overwrite — exactly how notes are named in the
   sibling notes app.
4. The saved session appears in the left sidebar. Organize with the folder
   button, or switch namespaces (separate workspaces) from the switcher on
   top.

## Modes

The top-bar buttons switch the keypad layout: **basic** (`123`),
**scientific** (`sin`), **programmer** (`0x`, with a hex readout of the
result). The active session remembers its mode — reopening it resumes the
layout you left it in.

Settings → Layouts lets you:

- enable/disable modes in the top bar,
- **Customize** a mode — press a button to remove it from the layout, press
  it again to bring it back,
- create a **new mode**: pick a base layout, press away the buttons you
  don't use, and name it.

## Keyboard

Digits and operators type straight in (`*` and `x`-less spellings both
work); `Enter` = `=`, `Backspace` deletes, `Escape` clears. `sqrt(`, `sin(`,
`0xFF`, `1 << 8`, `5!` are all valid in any mode — layouts only decide which
buttons are visible, not what the evaluator accepts.
