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
   entry lands on the tape above the display, which always keeps the last
   few entries in view. Drag the hairline under the tape to give it more of
   the screen (drag it far enough and it takes all of it); on a phone, swipe
   down the tape to open it the whole way. Pressing `=` again on the same
   calculation adds nothing new — a held key lights the entry that already
   records it rather than repeating it down the tape.
2. Left-swipe a tape entry — or right-click it — and press the note button
   and write down _why_ this calculation exists. Tap an entry to copy its
   value; long-press to copy the expression — on an entry that continued
   from the one above, the long press offers the whole run folded into one
   expression instead. The star in the left gutter highlights the rows worth
   finding again.
3. Press the **disk icon** in the top bar. If no storage backend is
   connected yet, Settings → Storage opens — pick a local folder (Chromium)
   or a cloud backend. The session gets a suggested name with the title
   field selected, ready to overwrite — exactly how notes are named in the
   sibling notes app.
4. The saved session appears in the left sidebar. Organize with the folder
   button, or switch namespaces (separate workspaces) from the switcher on
   top.

## Copy and paste

Press and hold the display and a twin pill rises over it: **Copy** takes
whatever the display is showing, **Paste** brings the clipboard in. The paste
half names what it would add, because it does not always add what was copied
— an expression or number the calculator understands (`12×4.5`, `0xFF`,
`-0.5`) goes in verbatim, and text it cannot parse gives up its first number
instead, in either locale's separators (`Total: $1,234.56` → `1234.56`, `1
234,56 kr` → `1234.56`). Text with no number in it offers nothing and the
half stays dark. What lands is typed onto the expression exactly as the
keypad would type it, so pasting onto `12×` continues that calculation.

The browser decides whether a page may read the clipboard: some ask first,
and Firefox may refuse outright. A refusal leaves the paste half dark — the
copy half still works.

## Erasing

The keypad has a single erase key, and it follows the display. While there
are characters on it the key reads `⌫` — a tap takes one back, a press-and-
hold wipes the expression. Once the display is empty it reads `C`: there is
nothing left to erase, so a tap does nothing, and a press-and-hold offers to
clear the session's tape instead (it confirms first — entries, notes and
stars go together, and nothing brings them back).

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
work); `Enter` = `=`, `Backspace` deletes, and `C` or `Escape` clears — on the
programmer pad `C` stays the hex digit its button spells, so use `Escape`
there. `sqrt(`, `sin(`, `0xFF`, `1 << 8`, `5!` are all valid in any mode —
layouts only decide which buttons are visible, not what the evaluator accepts.

Whatever you type lights the button that answered it: the cap dips, its glyph
takes the theme accent, and a soft halo fades out of it — the same feedback a
tap gives, so the pad still reads as the thing you are driving.
