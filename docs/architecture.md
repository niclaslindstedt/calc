# Architecture

Calc is a single-page Preact app built on
[`@niclaslindstedt/oss-framework`](https://github.com/niclaslindstedt/oss-framework)
(Vite 8, Tailwind v4, TypeScript strict). There is no router and no global
store — state is React hooks, documents are markdown files, and the
framework supplies the shell primitives (sidebar, theme engine, namespaces,
storage transports, gesture hooks, components).

## Runtime shape

```
main.tsx
└── App.tsx                    theme, sidebar shell, top bar, modals
    ├── SidebarRails.tsx       the two collapse rails: the docked sidebar's
    │                          edge grip, and the one above the footer
    ├── SideMenuContent.tsx    namespaces, folders, saved sessions, footer
    ├── CalculatorScreen.tsx   tape (always visible, and a drag handle in
    │   │                      its own right), the draggable seam, display,
    │   │                      Keypad
    │   ├── DisplayReadout.tsx result on top, expression under it, error or
    │   │                      hex below; sized by the Appearance setting
    │   ├── RevealText.tsx     the expression's per-character reveal
    │   ├── ExpressionText     the same expression, still — operators as
    │   │                      chips, `sqrt(` as an accented `√(`,
    │   │                      brackets coloured by depth
    │   │                      (expression.ts splits them out)
    │   ├── HistoryEntryRow    tap=copy value, long-press=copy expression
    │   │                      or chain, star gutter, left-swipe or
    │   │                      right-click=note/delete
    │   ├── CopiedFlash.tsx    the copy confirmation over the value it took
    │   │                      (portalled, so the tape cannot clip it)
    │   ├── ClipboardPill.tsx  the copy / paste twin pill a long press on the
    │   │                      display raises (portalled to document.body)
    │   └── Keypad.tsx         mode-driven grid; the erase key reads the
    │                          display (⌫ / C, tap and hold); doubles as the
    │                          mode editor
    └── SettingsModal.tsx      General / Layouts / Appearance / Storage
```

The runtime is Preact via `preact/compat`: `@preact/preset-vite` aliases
`react`/`react-dom` at bundle time, `tsconfig.json`'s `paths` teach `tsc`
the same aliasing, and `package.json` `overrides` pin the npm side. App code
imports hooks from `"react"` (the sibling apps' convention).

## State

| Hook               | Owns                                                                                                                                                                                                  | Persistence                                                        |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| `useSessions(ns)`  | Active session (scratch or saved), saved list, folders, actions                                                                                                                                       | Storage backend (markdown); the scratch tape mirrored to IndexedDB |
| `useAppSettings()` | Gestures, key animation, sidebar open mode, display and keypad text sizes, enabled modes, hidden keys, custom modes — read here, staged as a draft in the Settings dialog and committed whole on Save | localStorage `calc:settings`                                       |
| `useNamespaces()`  | Namespace registry + active slug                                                                                                                                                                      | localStorage `calc:namespaces`                                     |
| `App` appearance   | Theme / fonts / UI style (`ThemeAppearance`)                                                                                                                                                          | localStorage `calc:appearance`                                     |

A **scratch** session is not a file — it becomes one when it is named. There
is no save button: typing a title in the top bar writes the tape to the
backend there and then, and from that point every calculation writes through
as `=` is pressed (`useSessions.logEntry` persists immediately); the slower
edits — a note, a star, a deleted row, a mode switch — debounce 800 ms
(`useSessions.persistSession`). Every write, save or delete, is chained onto
one queue so a burst of calculations reaches the backend in the order it was
made. A scratch session is not lost when the tab closes either: `scratch.ts`
mirrors it into IndexedDB on every change and `useSessions` reads it back on
the next visit, so a tape nobody clears keeps its history indefinitely, with
or without a storage backend behind it. Clearing the tape (or naming it, so
it becomes a file) drops the device copy. Naming a tape with no backend
connected keeps it on the device and writes it out as soon as one is
connected. Clearing the name of a session that is already a file does not
delete the file.

## Domain modules (pure, tested)

- `evaluator.ts` — tokenizer + recursive-descent parser over one grammar
  shared by every mode: arithmetic, `%` (modulo), `^` (right-assoc power),
  postfix `!`, functions (`sqrt`, trig, `ln`/`log`, …), constants (`π`,
  `e`), hex/binary literals, and BigInt-exact bitwise operators with C-like
  precedence. Brackets left open on the end are closed for the caller
  (`closeParens`), so `sin(2` evaluates as `sin(2)` and the tape records the
  finished expression. Modes are presentation only — any stored expression
  re-evaluates identically anywhere.
- `session.ts` — `Session` / `Entry` / `Folder` model and pure operations.
- `chain.ts` — folds a run of calculations that each built on the last
  result back into one expression (`1+2 = 3`, `3*2 = 6` → `(1+2)*2`),
  bracketing only where the evaluator's precedence would otherwise
  re-associate it. Its precedence table mirrors `evaluator.ts` — the two
  move together.
- `codec.ts` — the markdown + YAML front matter file format (see
  [storage-format.md](storage-format.md)), filenames, directory layout.
- `modes.ts` — keypad layouts (basic / scientific / programmer), custom-mode
  resolution, and the visible-keys filter behind per-mode customization.
- `expression.ts` — how an expression is read rather than stored: the split
  into values and the operators between them, which the display and the tape
  draw as bordered chips. Only operators with an operand on their left are
  chipped, so the `−` in `−5` stays welded to its number. It also names the
  functions written as a symbol — a stored `sqrt(9)` reads as an accented
  `√(9)` — replacing the name only, so the bracket and the argument still
  show the call the entry re-evaluates to. Each segment carries its bracket
  depth as well, and `parenClass()` turns that into the class
  (`.calc-paren-1…3` in `styles.css`, mapped to theme colours) that paints a
  whole bracketed group — brackets, digits, chips and symbols alike — in one
  colour, the next level in the next.
- `paste.ts` — what the clipboard has to offer the display: text the shared
  grammar already understands pastes verbatim, text it cannot parse gives up
  its first number instead (`Total: $1,234.56` → `1234.56`, either locale's
  separators), and text with no number in it offers nothing, which is what
  keeps the paste half of the bar dark.

## Storage

`scratch.ts` keeps the working tape on the device (IndexedDB, best-effort:
a private window or a denied quota simply reads back as "nothing there").
`store.ts` composes the framework's byte-level `FileStore` transports —
`createFolderFileStore` (File System Access), `createDropboxFileStore`,
`createGdriveFileStore` — and binds them with `createSessionStore`: one
markdown file per session at
`[<namespace>/]calculations/[<folder>/]<slug>-<id6>.md`, plus a
`folders.json` registry. The `folder:` front matter id is authoritative; the
physical directory is a write-side projection for browsability. Renames
write the new path, then reconcile the old file away.

localStorage keys (settings and pointers only, never documents):

```
calc:settings            app settings (modes, hidden keys, gestures,
                         sidebar open mode, display and keypad text sizes)
calc:appearance          theme appearance
calc:namespaces          namespace registry
calc:namespace:active    active namespace slug
calc:backend             chosen backend id
calc:dropbox:token/:refresh, calc:gdrive:token   OAuth tokens
calc:menu-position       sidebar button position
calc:sidebar-collapsed   docked sidebar folded away to its edge rail
calc:footer-collapsed    sidebar footer folded away behind its rail
```

Both collapse flags are per-device layout choices — a wide desktop and a
small laptop want different answers — so they ride localStorage rather than
the appearance store.

IndexedDB holds the two things localStorage must not: the folder backend's
directory handle (framework-managed, `oss:folder-handles`) and the scratch
tape (`calc:scratch`, one markdown record per namespace slug — the same
document format the backends write, so there is one codec and one round
trip).

Settings → Storage drives all of this from one picker (Device / Folder /
Dropbox / Drive). Connecting swaps the `FileStore` behind `useSessions`,
which bumps a store epoch so the session store is rebuilt and re-listed — a
switch straight from one connected backend to another changes no other state,
so without that epoch the old transport would keep taking the writes.

## PWA

`pwa-plugin.ts` (build-time, no Workbox) emits `sw.js` (prompt-to-update
precache worker), `version.json`, `precache-manifest.json`, and a generated
`manifest.webmanifest` per deploy channel. `src/app/pwa.ts` holds the shared
cache-naming contract (`cacheIdForBase`) imported by both the app and the
plugin. Release channels: `/` (latest tag), `/preview/` (main), and
`/branch/<name>/` — see `.github/workflows/pages.yml`.
