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
    ├── SideMenuContent.tsx    namespaces, folders, saved sessions, footer
    ├── CalculatorScreen.tsx   tape (swipe-down), display, Keypad
    │   ├── HistoryEntryRow    tap=copy value, long-press=copy expression,
    │   │                      left-swipe=note/delete
    │   └── Keypad.tsx         mode-driven grid; doubles as the mode editor
    └── SettingsModal.tsx      General / Layouts / Appearance / Storage
```

The runtime is Preact via `preact/compat`: `@preact/preset-vite` aliases
`react`/`react-dom` at bundle time, `tsconfig.json`'s `paths` teach `tsc`
the same aliasing, and `package.json` `overrides` pin the npm side. App code
imports hooks from `"react"` (the sibling apps' convention).

## State

| Hook               | Owns                                                              | Persistence                    |
| ------------------ | ----------------------------------------------------------------- | ------------------------------ |
| `useSessions(ns)`  | Active session (scratch or saved), saved list, folders, actions   | Storage backend (markdown)     |
| `useAppSettings()` | Gestures, key animation, enabled modes, hidden keys, custom modes | localStorage `calc:settings`   |
| `useNamespaces()`  | Namespace registry + active slug                                  | localStorage `calc:namespaces` |
| `App` appearance   | Theme / fonts / UI style (`ThemeAppearance`)                      | localStorage `calc:appearance` |

A **scratch** session exists only in memory — it becomes a file when the
disk icon saves it. A **saved** session writes through on every change,
debounced 800 ms (`useSessions.persistSession`).

## Domain modules (pure, tested)

- `evaluator.ts` — tokenizer + recursive-descent parser over one grammar
  shared by every mode: arithmetic, `%` (modulo), `^` (right-assoc power),
  postfix `!`, functions (`sqrt`, trig, `ln`/`log`, …), constants (`π`,
  `e`), hex/binary literals, and BigInt-exact bitwise operators with C-like
  precedence. Modes are presentation only — any stored expression
  re-evaluates identically anywhere.
- `session.ts` — `Session` / `Entry` / `Folder` model and pure operations.
- `codec.ts` — the markdown + YAML front matter file format (see
  [storage-format.md](storage-format.md)), filenames, directory layout.
- `modes.ts` — keypad layouts (basic / scientific / programmer), custom-mode
  resolution, and the visible-keys filter behind per-mode customization.

## Storage

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
calc:settings            app settings (modes, hidden keys, gestures)
calc:appearance          theme appearance
calc:namespaces          namespace registry
calc:namespace:active    active namespace slug
calc:backend             chosen backend id
calc:dropbox:token/:refresh, calc:gdrive:token   OAuth tokens
calc:menu-position       sidebar button position
```

The folder backend's directory handle lives in IndexedDB
(framework-managed).

## PWA

`pwa-plugin.ts` (build-time, no Workbox) emits `sw.js` (prompt-to-update
precache worker), `version.json`, `precache-manifest.json`, and a generated
`manifest.webmanifest` per deploy channel. `src/app/pwa.ts` holds the shared
cache-naming contract (`cacheIdForBase`) imported by both the app and the
plugin. Release channels: `/` (latest tag), `/preview/` (main), and
`/branch/<name>/` — see `.github/workflows/pages.yml`.
