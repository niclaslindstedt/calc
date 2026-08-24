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

- **General** — swipe-down-for-history, key press animation.
- **Layouts** — which modes the top bar offers, per-mode hidden buttons,
  and user-defined custom modes (a named copy of a base layout).
- **Appearance** — the framework theme picker (presets, fonts, UI style),
  shared look-and-feel with the sibling notes/checklist/contacts apps.
- **Storage** — connect/disconnect the session storage backend.

## Storage backends

| Backend      | Requirements                          | Notes                                                                                      |
| ------------ | ------------------------------------- | ------------------------------------------------------------------------------------------ |
| Local folder | Chromium (File System Access API)     | The directory handle persists in IndexedDB; the browser re-asks permission after restarts. |
| Dropbox      | `VITE_DROPBOX_APP_KEY` at build time  | PKCE redirect flow; tokens in localStorage.                                                |
| Google Drive | `VITE_GOOGLE_CLIENT_ID` at build time | GIS popup tokens; re-prompts on expiry.                                                    |

Sessions are markdown files — see [storage-format.md](storage-format.md) for
the layout a backend ends up holding.
