// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// Builds the web app and packs its `dist/` into one asset —
// `native/assets/webroot.zip` — that the wrapper bundles, unpacks on first
// launch and serves over a loopback HTTP server (src/local-server.ts). That is
// what makes the app self-contained: the calculator runs entirely
// on-device, and changes only when a new build ships to the store.
//
// The web build is `npm run build` at the repo root — base `/`, which is
// exactly what a localhost origin wants — in the environment
// `web-build-env.mjs` composes: `VITE_NATIVE_BUILD=on`, about the channel
// rather than the medium (an app from a store carries no link back to the
// source, by owner decision, so it compiles out the sidebar's About entry and
// leaves the web edition's address out of the page — see `vite.config.ts`),
// `VITE_SHELL_BUILD=on`, about the medium (no service worker and no update
// prompt: the app changes only when a new build ships), and
// `APP_DISPLAY_NAME`, the store listing's name, which the app then calls
// itself. Nothing else in `src/` changes for the app. If the wrapper ever needs
// the web app to behave differently in some other way, that is a sign it has
// stopped being thin.
//
// The flags are build-time, so `--skip-build` re-zips whatever the last build
// left in `dist/` — and a website build there carries those links and a
// service worker. The zip is refused when either is found in it
// (`webroot-checks.mjs`).
//
// Usage:
//   node scripts/bundle-web.mjs                 # build the site, then zip it
//   node scripts/bundle-web.mjs --skip-build    # re-zip an existing dist/
//   node scripts/bundle-web.mjs --profile production
//
// `--profile` is accepted (and echoed) so the release scripts and the CI
// workflow can pass the EAS profile through uniformly. It does not change the
// build today — the web app has no profile-dependent output — but the seam is
// where a "strip the developer menu from store builds" knob would land, and
// having the plumbing already correct is cheaper than retrofitting it.
//
// The zip is a build artifact (gitignored). Generate it before `eas build`;
// `.easignore` is what keeps it in the EAS upload despite that.

import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { zipSync } from "fflate";

import { webBuildEnv } from "./web-build-env.mjs";
import {
  assertNoServiceWorker,
  assertNoSourceLink,
} from "./webroot-checks.mjs";

const APP_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_DIR = resolve(APP_DIR, "..");
const DIST_DIR = join(REPO_DIR, "dist");
const OUT_ZIP = join(APP_DIR, "assets", "webroot.zip");
const WINDOWS = process.platform === "win32";
const NPM = WINDOWS ? "npm.cmd" : "npm";

const skipBuild = process.argv.includes("--skip-build");
const profileArg = process.argv.indexOf("--profile");
const profile =
  (profileArg >= 0 ? process.argv[profileArg + 1] : undefined) ??
  process.env.EAS_BUILD_PROFILE ??
  "preview";

if (!skipBuild) {
  const env = webBuildEnv(process.env, profile);
  console.log(
    `• building the web app (npm run build) — profile ${profile}, named ` +
      (env.APP_DISPLAY_NAME
        ? `"${env.APP_DISPLAY_NAME}"`
        : "by the project (APP_DISPLAY_NAME unset)") +
      "…",
  );
  execFileSync(NPM, ["run", "build"], {
    cwd: REPO_DIR,
    stdio: "inherit",
    // npm on Windows is a batch shim, which Node cannot execute directly.
    shell: WINDOWS,
    env,
  });
}

/** Collect `dist/` into the flat `{ "index.html": bytes }` shape fflate wants,
 *  with forward-slash paths relative to the dist root. */
function collect(dir, files = {}) {
  for (const entry of readdirSync(dir)) {
    const abs = join(dir, entry);
    if (statSync(abs).isDirectory()) {
      collect(abs, files);
    } else {
      files[relative(DIST_DIR, abs).split("\\").join("/")] = new Uint8Array(
        readFileSync(abs),
      );
    }
  }
  return files;
}

let files;
try {
  files = collect(DIST_DIR);
} catch (error) {
  console.error(
    `\n✗ could not read ${DIST_DIR} — build the web app first ` +
      `(drop --skip-build, or run 'npm run build' at the repo root).\n`,
  );
  throw error;
}

const count = Object.keys(files).length;
if (count === 0 || !files["index.html"]) {
  throw new Error(
    `dist/ has no index.html (${count} files) — the web build looks empty.`,
  );
}

// A website build left in `dist/` is refused: a link back to the source, or a
// service worker (`sw.js`) — see `webroot-checks.mjs`.
assertNoSourceLink(files);
assertNoServiceWorker(files);

// Deterministic zip: every entry pinned to the ZIP epoch (1980-01-01), so the
// artifact is reproducible instead of drifting with the clock.
const zipped = zipSync(files, { mtime: new Date("1980-01-01T00:00:00Z") });
mkdirSync(dirname(OUT_ZIP), { recursive: true });
writeFileSync(OUT_ZIP, zipped);

console.log(
  `✓ wrote ${OUT_ZIP} — ${count} files, ${(zipped.length / 1024).toFixed(0)} KB`,
);
