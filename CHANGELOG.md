# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Released sections below are **generated at release time from the changeset
fragments** in `.changes/unreleased/` — add a fragment per user-visible change,
and the Release workflow collates them into a dated section here. Do not
hand-edit the released sections.

## [Unreleased]

## [0.2.0] - 2026-10-18

### Added

- **The calculator, sessions, and markdown storage** — Named calculator sessions with a commentable tape (swipe down for history, tap to copy a value, long-press to copy the expression, left-swipe to attach a note), basic/scientific/programmer layouts plus user-defined modes with per-button customization, folders and namespaces in the sidebar, themes, and sessions stored as markdown files in a local folder or Dropbox.
- **Copy a whole calculation chain** — Keep building on a result without pressing `C` and the run stays linked. Long-pressing such an entry offers its own expression or the whole chain folded into one expression: `1+2 = 3` followed by `3*2 = 6` copies as `(1+2)*2`, with brackets added only where the grammar needs them to keep the value. Chained entries are marked with a leading ↳ in the markdown file.
- **An About entry in the sidebar footer** — The sidebar footer now carries About above Settings, opening a compact panel with the source-code link (subtitled with the exact build identifier the app is running) and a link to report an issue.
- **Keypad button text size** — Settings → Appearance sizes the keypad's button labels (Small / Medium / Large / Huge) with a live preview of the pad right under the picker. The keys keep their size and layout; only the text grows, so a bigger label costs nothing on screen.
- **Choose how the sidebar opens** — Settings → General now offers "Open sidebar with": the draggable floating menu button, or an inward swipe from the edge it rests against. It used to be both at once, which put a button over the display for people who only ever swiped; now it is one or the other, as in the contacts sibling. A docked (wide-screen) sidebar is unaffected.
- **Copy and paste on the display** — Press and hold the display and a twin pill rises over it: **Copy** takes the expression (or number) on it, **Paste** brings the clipboard in. Paste takes an expression or number the calculator understands verbatim, and otherwise salvages the first number out of the text — `Total: $1,234.56` pastes `1234.56` — so the half stays dark only when there is nothing usable to paste.
- **Characters reveal as they are typed** — each new character slides in from the right of the expression line as the text already on it settles left, one glyph at a time. Pasting or landing on a result reveals the run in sequence rather than all at once. Short and eased, so it keeps pace with the keypad instead of queueing behind it; `prefers-reduced-motion` turns it off.
- **Display text size** — Settings → Appearance → Display sizes the result and the expression under it (Small / Medium / Large / Huge) with a live preview of the real readout. The two step together, so the result always stays the headline, and the display keeps enough height for the size it was asked to draw.
- **Right-click a tape entry for its actions** — the note and delete actions a left swipe reveals on a phone now also arrive as a menu under the pointer, in the same order and wording. A desktop pointer has no swipe in it, so the row's actions had been out of reach outside the keyboard.
- **The sidebar folds away, and so does its footer** — Ported from the notes sibling: a docked sidebar now carries a chevron grip on its inner edge that hides the whole panel and hands its width to the calculator. The grip costs nothing at rest — it stays invisible and click-through until the pointer comes to that edge looking for it (a touch device, which cannot hover, keeps it up), and once collapsed it waits at the screen edge to bring the panel back. A second chevron rail above the sidebar footer folds About and Settings away, so the session list gets those rows instead; that one is offered on the phone drawer too. Both choices are remembered per device.
- **Every press is felt on the pad** — A key answering a press now dips under the finger, its glyph takes the theme accent, and a soft accent halo blooms out of the cap and fades. It is driven by state rather than `:active`, so a calculation typed on a hardware keyboard lights the same buttons a tapped one does. `C` on the keyboard clears the entry (the programmer pad keeps it as the hex digit its button spells, where `Escape` still clears), and the erase key's `⌫` is drawn at the weight of the digits beside it instead of a footnote.
- **A bracket left open at the end closes itself** — `sqrt(3`, `sin(2` and
  `(25+3)*(5+1` all answer as written. A display has no cursor to go back
  with, so the closers that finish an expression were never in doubt; the tape
  records the finished expression (`sqrt(3)`), which re-reads and re-evaluates
  like every other entry. A `)` that never had an opener is still an error.
- **A hardware keyboard types names, on every layout** — `sqrt(2)+sin(0)` goes
  in on the basic pad exactly as it does on the scientific one. The keyboard
  types into the one grammar every mode shares, so a layout decides which keys
  are worth a thumb, not which expressions the calculator understands. A typed
  name the current pad has no cap for simply lands on the display, and typed
  operators land as the glyphs the keys draw — `*`, `/` and `-` go on the
  display as `×`, `÷` and `−`, so the operator chips frame a multiplication
  sign rather than an asterisk.
- **The tape you are working on stays on this device** — close the tab, reload,
  come back tomorrow, and the unsaved tape is still there with its notes and
  stars. It only goes when you clear it yourself or put it away by opening
  another session, so a history nobody clears keeps growing whether or not a
  storage backend is connected. The tape is kept in IndexedDB as the same
  markdown a backend would hold; settings stay in localStorage, documents never
  do.
- **Brackets are coloured by what they hold** — everything between a `(` and its `)`, brackets and digits and operator chips alike, shares one colour, and a group nested inside it takes the next: `2×(3+(4−1))` shows what is counted together without tracing the brackets by eye. Three levels of colour, drawn from the current theme, on the display and the tape alike.
- **The `×` in front of a bracket is optional** — `5(6+6)` is 60, the way it
  would be on paper, and so are `2π`, `(1+2)(3+4)` and `3sqrt(9)`. An omitted
  sign multiplies exactly where a typed one does, so `2^3(4)` and `2^3*4` are
  the same 32 and a chain folds it like any other product: `1+2 = 3`, then
  `3(4)`, copies as `(1+2)(4)`.
- **Calc as an app** — Calc now ships as an installable app for iPhone, iPad and Android, carrying the whole calculator inside it so it works with no network at all.
- **Sessions in iCloud Drive** — In the app, Settings → Storage offers iCloud Drive, and your sessions follow you between your Apple devices in a folder you can open in Files.
- **Calc on the desktop** — Calc now has a desktop download for Windows, macOS and Linux, attached to every release. It is the same app with a window around it, it needs no network, and it keeps its own sessions on your machine.
- **Dropbox in the desktop app** — The desktop app can now connect Dropbox: signing in opens your usual browser, and the app picks up the result once you approve.
- **A demo to try** — `make demo` (or any build with `VITE_SEED=demo`) opens Calc on a shelf of eight example sessions — a kitchen floor, an invoice, a trip split four ways, a shed roof, an office subnet and more — each with its notes and stars. The demo lives in memory: it never reads or writes this browser's own sessions, and it will not connect a folder or a cloud. A normal build carries none of it.

### Changed

- **The tape reads result-first, with a note button on every entry** — Tape entries now show the result large with the expression it came from underneath, and carry a note button in the left gutter, so annotating a calculation no longer depends on discovering the left-swipe. A short tape rests on the display instead of floating at the top of the panel, and the keypad's keys grow into the bottom of the screen.
- **The tape always keeps a slice of the screen** — The session history no longer collapses to nothing. It sits above the display showing roughly the last four entries, scrolls, and expands to half the screen from the handle or a swipe down on the display. The handle now reads "Expand history" / "Collapse history".
- **A star in the tape's left gutter, not a note button** — The left gutter of each tape entry is now a star, for flagging the rows that matter in a long session. Notes stay on the entry's left-swipe actions, and a starred entry is written to the markdown file with a leading ⭐.
- **Copies confirm over the value, not at the bottom of the screen** — Copying a tape entry now flicks a brief "Value copied" / "Expression copied" label just above the number it took, instead of pushing a toast to the bottom of the app.
- **Settings redesigned, and it now owns storage** — The Settings dialog picked up the sibling contacts app's shell: a vertical section rail on desktop, a section menu behind the header burger on mobile, and a Reset / Cancel / Save footer, so changes can be abandoned. Connecting a storage backend moved out of the sidebar footer and into Settings → Storage, where it still applies immediately.
- **One erase key that reads the display** — `C` now follows what's on the display. With characters typed it reads `⌫`: a tap takes one back, a press-and-hold wipes the whole expression. With the display empty it reads `C`, a tap does nothing — there is nothing left to erase — and a press-and-hold clears the session's tape after confirming. The separate `⌫` key is gone from the scientific and programmer layouts, since the erase key now covers both gestures.
- **A quieter empty tape** — An empty session history now just reads "No entries" instead of explaining where calculations land.
- **Settings → Storage picks a backend instead of hiding them** — Device, Folder, Dropbox and Drive are now segments of one picker, each explaining what it stores and where. A backend this browser or build cannot reach (no File System Access API, no OAuth app key baked in) says so when picked, rather than vanishing and leaving the tab looking empty. Connect buttons spin while an OAuth redirect or the directory picker is in flight, a dismissed folder picker is a quiet no-op, and switching straight from one connected backend to another now rebuilds the session store instead of writing on through the old one.
- **The display leads with the result** — the answer is now the big number on top and the expression it came from reads underneath it, so the eye lands on what the calculation is worth rather than on what was typed. A half-finished expression (`12+`) keeps the last real answer up, dimmed, instead of blanking the headline on every operator press; the hex spelling and any error sit on a thin line below.
- **The tape is resized by dragging its edge** — the chevron-and-caption "Expand history" bar is now a single hairline with a grab glyph on it, and the tape takes whatever share of the screen the handle is left at instead of the one half-and-half step it had. Drag it nearly shut and the tape falls back to its resting height; drag it far enough that the display and the keys no longer fit and the tape takes the whole screen, the handle parked at the bottom to pull back up. Clicking the handle still toggles, the arrow keys step it, and on a phone a swipe down the tape opens it the whole way while the display's swipe steps it open and shut.
- **Operators are drawn as glyph chips** — `1+2` now reads `1 + 2` on the display and the tape alike, the operator lifted out of the digits into a bordered accent chip with air either side, the way it sits on the keypad. Only operators with an operand on their left are chipped: the `−` in `−5` is a sign, so it stays welded to its number.
- **No more "History cleared" toast** — Clearing the tape already goes through a confirm dialog, and the emptied tape says the rest; the toast confirming it again is gone.
- **The app icon joins the family lineup** — The mark is now a bold division sign in the sibling apps' green gradient instead of the amber equals, so Calc sits with the rest of the home-screen row. The favicon, PWA install icons, and the social-preview card all carry the new mark.
- **The whole tape is the drag handle, and the calculator slides out from under it** — dragging anywhere on the session tape now resizes it, so a tape that has taken the screen is shut with the same gesture that opened it instead of by finding the hairline at the bottom edge; where the tape has entries to scroll, the list keeps the drag until it reaches one of its ends. Past the point where the display and the keys still fit, the calculator now slides off the bottom of the column rather than the tape snapping over it, and a release with the calculator half covered settles on whichever end is nearer. The seam's grab glyph wears the accent colour.
- **The basic pad is laid out like a phone calculator** — the digits keep the operators down their right-hand edge with `+` drawn tall over the bottom two rows, the erase key and `=` take the foot, and a new top row carries `±`, `(`, `)` and `√`. `±` flips the sign of the value the display ends on (`12+34` → `12+−34`) and gives it back on a second press; with nothing typed it lays the sign down for the number about to be entered. Every one of the new keys can be trimmed away again in Settings → Layouts.
- **`Escape` and `Delete` clear the display; plain `c` now types** — it is the
  start of `cos(`, `ceil(` and `cbrt(`, so it could not stay a shortcut. A
  shifted `C` still clears, except on the programmer pad where `C` is the hex
  digit its button spells.
- **The keypad is one rounded slab, and its keys are colour-coded** — The pad no longer draws a tray of separate caps: the keys are cut out of a single rounded box, divided by hairlines, with the corner keys rounded into it. The digits take the lightest fill so the block the thumb aims at reads first, the operators sit darker under their accent glyphs, the trimmings (sign, brackets, root, modulo) sit darker again, and the erase key wears the theme's danger colour. Every fill is mixed from the active theme's own colours, so the pad follows a theme swap rather than being pinned to one palette, and a pressed key now lights and washes its colour out instead of travelling down.
- **Naming a session is what saves it — the save button is gone** — The disk
  icon has been removed from the top bar. Type a name for the tape and it
  becomes a markdown file there and then, and every calculation after that is
  written to storage as you press `=`, so a named session is never behind what
  is on the tape. Notes, stars and deleted rows still debounce; the glyph beside
  the mode buttons says where the tape stands. An unnamed tape stays scratch and
  keeps living on the device.
- **A square root reads as `√` on the tape** — A calculation entered with the `√` key was logged as the `sqrt(9)` the evaluator parses, so the tape read back a word the keypad never showed. The display and the tape now set that name as an accented `√`, leaving the bracket and the argument where they are — `√(9)` — while the entry, and the markdown file it saves to, still store the expression verbatim.
- **The save status is a glyph** — The words beside the mode buttons
  (_Unsaved_, _Saving…_, _Saved_, _This device_) have been replaced by the sync
  glyph the contacts sibling flies in its own header: one icon for a tape that
  is not a file yet, a write in flight, a session saved to wherever it is saved,
  or a save that failed. It says where the tape stands on hover, and a press
  opens Settings → Storage — which is where any of it is changed.
- **The tape only opens when there is more of it to see** — The handle on the
  hairline under the tape used to offer to expand a history that was already
  entirely on screen, trading half the keypad for a page of blank paper. Now the
  handle steps off the hairline while every entry is in view — leaving it the
  plain divider it also is — and the gestures that open the tape (clicking the
  seam, its arrow keys, dragging either it or the tape, swiping the display
  down) do nothing until there is something behind the fold. The seam keeps its
  height throughout, so an entry crossing that threshold never shifts the keys
  under your fingers.
- **The title is just "Calc"** — The browser tab, the social card titles, and the installed PWA name drop the "— a local-first calculator" tail and read simply "Calc".
- **A signed and notarized Mac download** — The macOS desktop app can now be signed with a Developer ID and notarized by Apple, so it opens like any other app instead of asking you to allow it in System Settings first. Each release's notes say whether its Mac download is notarized.
- **Not indexed** — The website asks search engines not to index it, and no longer ships a sitemap, structured data or `llms.txt`. Find the app on the App Store and at apps.agilator.se.
- **US spelling** — The app's English is US English, in spelling and in word choice: "Color", "canceled", "Minimize", "customize", "right away". Nothing stored changes.
- **The phone app calls itself by its store name** — Inside the App Store app, the page title and the text that names the app use the name under its icon; the website and the desktop app keep "Calc".
- **The edge swipe is offered where the edge is free** — "Open sidebar with" in Settings → General now appears in the phone app and the installed app, and no longer in a browser tab, where the browser's own back-swipe owns the screen edge. A browser tab always shows the floating menu button, even if the swipe was chosen there before.

### Fixed

- **The keypad's bottom row no longer falls off the screen** — The installed iOS PWA (and iOS Safari) cut the layout off above the `=` key: the reveal handle's chevron had no size and stretched to fill half the screen, and the app shell sized itself to a viewport iOS letterboxes. The shell now sizes to `--app-height` (lifted to `100vh` in the installed iOS PWA, matching the sibling apps), every framework glyph is sized, and the keypad keeps a floor tall enough for all its rows — the display gives up the space instead.
- **No more stray `=` row on the scientific and programmer pads** — Both layouts flowed their digits and operators into a 5-column grid they didn't fill, which left holes mid-pad and pushed `=` onto a row of its own. The digit block now sits under a two-column operator stack in both, and the keypad packs rows from the layout as authored: hiding a key in Settings → Layouts widens the rest of _its_ row instead of shuffling every key after it across the pad.
- **No more blue text selection on the display** — Holding the expression on a
  phone raised the clipboard bar and, underneath it, the platform's own text
  selection: blue handles over the number and a highlight dragged up into the
  tape toggle. The display is now unselectable, so the hold does one thing —
  the copy/paste bar is how text leaves it.
- **The copy confirmation is no longer sheared by the top bar** — copying the newest tape entry put its "Value copied" label half under the session title and mode buttons, because the label lived inside the scrolling tape and the newest row sits right at its top edge. It is now drawn out of the tape entirely, over the top bar rather than under it, and drops just inside the row on the rare screen with no room above.
- **Buttons look pressable again** — Every control in the app wore the plain arrow cursor, because the browser gives a `<button>` one and nothing overrode it. They all take the pointer now, and the surfaces that only ever answered a press silently — the mode pills, the keypad caps, the tape's rows — light up under the cursor as well.
- **No more dead band under the sidebar's collapse rail** — The panel reserved a bottom inset for whatever sat last in it, which left the folded footer's chevron rail floating above a strip of empty sidebar. The content now grows into that inset the way the sibling apps' do, and the footer and the rail carry their own breathing room — still clearing the home indicator, which this app paints under.
  
  Pressing the hide-sidebar grip also no longer leaves it holding focus, where the next digit typed at the calculator lit its ring down the whole edge of the screen.
- **Holding `=` no longer fills the tape with copies of one answer** — Pressing
  `=` (or ENTER) again on a calculation the tape already records — the held key
  re-evaluating the result `=` just left on the display, or the same expression
  typed out a second time — now highlights the entry that recorded it instead of
  appending an identical row after it.
- **Stray taps no longer select the tape's text** — Text selection was only suppressed on the display, so a tap or drag landing on the tape (or anywhere else in the shell) could still paint the platform's blue selection handles over the history — even over "No entries". Selection and the iOS long-press callout are now off app-wide; copying goes through the app's own gestures — the display's clipboard bar and a tape entry's menu — and fields where you actually type (session title, entry notes, settings) still select normally.
- **A squeezed display no longer cuts into the expression** — the floor the display keeps for itself was short of the three lines it draws at every text size, so dragging the tape down far enough clipped the top of the readout. Each size's floor is now the sum of what it actually draws.
- **Saving on _This device_ actually saves** — Naming a session with no folder
  or cloud connected used to leave it exactly where it was: nothing appeared in
  the sidebar, and the tape stayed scratch. The device is a storage backend now,
  not the absence of one — a named session becomes a markdown file in this
  browser's own storage (IndexedDB), lists in the sidebar, reopens after a
  reload, and takes folders, renames and deletes like a session in any other
  backend. Connecting a folder, Dropbox or Drive afterwards moves everything the
  device is holding into it rather than leaving it behind.
- **An unsaved tape survives an app update.** Pressing restart on the update
  prompt now waits for the working tape to reach this device before it reloads,
  so a reload can no longer land on a write still in flight. And the app no
  longer mistakes a device it could not read for a device with nothing on it:
  that answer used to open a fresh tape and clear the record the old one was
  still sitting in, which is how an unsaved tape could go missing for good.
  When the tape cannot be read — a blocked database upgrade during the update's
  reload, a private window, a denied quota — the record is left untouched, and
  the read is retried against a freshly opened database first.
- **A new install opens your latest session, not a blank tape** — The working tape is kept on the device, so after reinstalling the app or starting on a new device Calc opened an empty tape even though every saved session was still in iCloud, Dropbox or your folder — which looked like the data was gone. When the device has no working tape, Calc now opens the most recently updated saved session as soon as your storage has listed it. A device that has a tape still resumes it, and a tape you have already started on is never replaced.
- **The iOS app fills the screen edge to edge, like the installed PWA** — The App Store build framed the page inside the safe area, leaving flat bands above and below it, so the sidebar and the keypad stopped short of the status bar and the home indicator. The page now runs full-bleed on iOS and pads itself around the notch and home indicator exactly as the PWA does.
- **The iOS status bar stays readable on every theme** — The clock and battery took their colour from the phone's light or dark setting rather than the app's theme, so a dark theme on a phone in light mode drew dark icons on a dark background, and a light theme in dark mode the reverse. Now that the page runs under the status bar, its icons follow the theme the app shows — light on a dark theme, dark on a light one — and switch with it.
- **A long hold no longer also taps** — Holding a key, a tape entry or the display for longer than about a second opened its hold action and then, as the finger lifted, acted as a tap on it as well. The lift now ends the hold and nothing else, however long it lasted.
- **The phone app carries no service worker** — Its bundled page is built as a shell build, like the desktop app's: no service worker and no "reload to apply" prompt, since the app changes only when a new version ships from the store. The bundle script now refuses a page that still holds one.

### Removed

- **Google Drive sync** — Google Drive is no longer one of the places sessions can be kept. A folder you
  pick and Dropbox remain.
  
  If you had Drive connected, the app falls back to a local session. Your files
  stay in their folder in your own Drive, where you can read, export or delete
  them as you would any other file — nothing is removed from your account.
- **No link to the source in the apps** — The phone and desktop apps no longer carry the About entry ("Source code", "Report an issue") or any link to the project's GitHub repository or web address; the website keeps them.
- **The phone app no longer offers Dropbox** — On iPhone and Android, Settings → Storage keeps your sessions on this device or, on iPhone, in your own iCloud Drive; Dropbox is not one of the places any more. An install that had Dropbox connected opens on this device, and the sessions already in your Dropbox stay there as files. The website and the desktop app keep Dropbox as before.

