# Troubleshooting

## `npm install` fails with 401/404 on `@niclaslindstedt/oss-framework`

The framework is published to GitHub Packages, which requires a token even
for public reads. Add to `~/.npmrc` (token needs the `read:packages` scope):

```
//npm.pkg.github.com/:_authToken=<token>
```

The committed project `.npmrc` only maps the `@niclaslindstedt` scope to the
registry — it deliberately carries no token. CI authenticates with the
workflow's `GITHUB_TOKEN`; Claude Code web sessions are wired by
`.claude/hooks/session-start.sh`.

## "Local folder…" is missing from Settings → Storage

The local-folder backend uses the File System Access API, which only
Chromium-based browsers ship. Firefox/Safari users can use a cloud backend
(when the build carries the OAuth ids) — or Chromium for a folder.

## The folder backend asks for permission again

Browsers re-prompt for persisted directory handles after a restart. The
sidebar's storage row shows "Reconnect folder…" — one click re-grants. If
the handle is gone entirely (profile cleared), reconnect picks the folder
again; existing files are re-read as-is.

## Dropbox / Google Drive buttons are missing

The cloud backends only appear when the build was given
`VITE_DROPBOX_APP_KEY` / `VITE_GOOGLE_CLIENT_ID` — see
[configuration.md](configuration.md). Local dev: put them in `.env`.

## Nothing is saved / my session disappeared

A tape is scratch by default — it lives in memory until the disk icon saves
it, and an untouched scratch tape is dropped when you open another session.
Connect a backend (Settings → Storage) and press the disk icon; the session
then appears in the sidebar and writes through on every change.

## A session file didn't show up in the sidebar

The store only lists files under `calculations/` whose front matter carries
`type: calculation` and an `id` — foreign markdown in the same folder is
skipped by design. Check the file starts with a `---` front matter block
(see [storage-format.md](storage-format.md)).

## The PWA won't pick up a new deploy

The service worker is prompt-to-update: the toast offers the new version,
and applying it reloads once. If the toast never appears, use the browser's
"Update app" / hard reload — and note that `vite dev` unregisters any
worker a previous `vite preview` left on the origin.

## Stale styles or tokens after upgrading the framework

Tailwind scans the framework's `dist` via the `@source` line in
`src/styles.css`; a stale Vite cache can survive an upgrade. Remove
`node_modules/.vite` and restart the dev server.
