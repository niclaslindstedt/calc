# Configuration

All configuration is optional — the app builds and runs with none of it set.

## Build-time environment (`.env`)

Copy `.env.example` to `.env` (git-ignored) and fill in what you need. These
are Vite build-time variables; the deploy workflows inject them from
repository variables (`vars.*`) in CI.

| Variable                  | Default | Effect                                                                                                                                                                            |
| ------------------------- | ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `VITE_DROPBOX_APP_KEY`    | unset   | Dropbox app key (PKCE public client). Unset hides the Dropbox backend in Settings → Storage. Register at <https://www.dropbox.com/developers/apps> (scoped access, "App folder"). |
| `VITE_GOOGLE_CLIENT_ID`   | unset   | Google OAuth client id (GIS token client). Unset hides the Google Drive backend. Needs the Drive API enabled.                                                                     |
| `VITE_DROPBOX_APP_FOLDER` | `Calc`  | Dropbox app-folder name (`Apps/<name>/`), fixed by your Dropbox app config.                                                                                                       |
| `VITE_GDRIVE_APP_FOLDER`  | `Calc`  | Folder created in My Drive to hold the synced files.                                                                                                                              |
| `VITE_BASE`               | `/`     | Deploy base path — set by the pages workflow per release channel.                                                                                                                 |
| `VITE_PWA_IGNORE_PATHS`   | unset   | Sibling deploy channels the root service worker must disown (see `pwa-plugin.ts`).                                                                                                |

## In-app settings

Settings live in localStorage under `calc:*` keys — they are device
preferences, never documents:

- **General** — swipe-down-for-history, key press animation, and how the
  sidebar opens on a phone ("Open sidebar with": the floating button, or an
  inward edge swipe — one or the other, never both).
- **Layouts** — which modes the top bar offers, per-mode hidden buttons,
  and user-defined custom modes (a named copy of a base layout).
- **Appearance** — keypad button text size (Small / Medium / Large / Huge,
  with a live preview of the pad) plus the framework theme picker (presets,
  fonts, UI style), shared look-and-feel with the sibling
  notes/checklist/contacts apps.
- **Storage** — pick and connect/disconnect the session storage backend.

## Storage backends

Settings → Storage offers all four choices as a picker, whether or not this
browser and build can reach them — a backend that cannot be connected
explains what it needs (a Chromium browser, or an app key baked into the
build) instead of quietly disappearing. Connecting applies immediately; it is
not staged behind the dialog's Save.

| Backend      | Requirements                          | Notes                                                                                      |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Device       | none                                  | The unconnected state: a tape lives in memory and the disk icon has nowhere to write.      |
| Local folder | Chromium (File System Access API)     | The directory handle persists in IndexedDB; the browser re-asks permission after restarts. |
| Dropbox      | `VITE_DROPBOX_APP_KEY` at build time  | PKCE redirect flow; tokens in localStorage.                                                |
| Google Drive | `VITE_GOOGLE_CLIENT_ID` at build time | GIS popup tokens; re-prompts on expiry.                                                    |

The deploy workflows read the two OAuth identifiers from repository variables
of the same name, so a fork that wants Dropbox or Drive sets
`VITE_DROPBOX_APP_KEY` / `VITE_GOOGLE_CLIENT_ID` there (and registers the
deployed URL as the OAuth redirect target). Without them the app still runs —
those two segments just explain that the build carries no key.

Sessions are markdown files — see [storage-format.md](storage-format.md) for
the layout a backend ends up holding.
