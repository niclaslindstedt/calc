// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { execSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

import preact from "@preact/preset-vite";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig, type Plugin } from "vite";

import { appPwa } from "./pwa-plugin.ts";
import { resolveAppName } from "./src/app/appName.ts";

// The base path is injected by the deploy workflows via VITE_BASE, one per
// release channel: the released app at `/`, the rolling main build at
// `/preview/`, and per-branch builds at `/branch/<name>/`. Defaults to `/`
// for local dev and preview builds.
const base = process.env.VITE_BASE ?? "/";

// Sibling release channels that live *under* this build's base and must be
// disowned by its service worker (see pwa-plugin.ts `ignorePaths`). Only the
// root release sets this — comma-separated absolute paths.
const ignorePaths = (process.env.VITE_PWA_IGNORE_PATHS ?? "")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);

// Build identity for the About / update toast.
const commit =
  process.env.GITHUB_SHA?.slice(0, 7) ??
  (() => {
    try {
      return execSync("git rev-parse --short HEAD", {
        encoding: "utf8",
      }).trim();
    } catch {
      return "unknown";
    }
  })();
const buildNumber = process.env.GITHUB_RUN_NUMBER ?? "dev";

const here = (p: string) => fileURLToPath(new URL(p, import.meta.url));

const appVersion = (
  JSON.parse(readFileSync(here("./package.json"), "utf8")) as {
    version: string;
  }
).version;

// `<version>[.<run>][-<slot>][+<commit>]` — `<run>` is the CI run number,
// `<slot>` marks the preview/branch channels, `<commit>` is semver build
// metadata. A local build collapses to just `<version>`.
const buildSlot =
  base === "/preview/" ? "pre" : base === "/branch/" ? "br" : "";
const buildLabel =
  appVersion +
  (process.env.GITHUB_RUN_NUMBER ? `.${process.env.GITHUB_RUN_NUMBER}` : "") +
  (buildSlot ? `-${buildSlot}` : "") +
  (process.env.GITHUB_SHA ? `+${process.env.GITHUB_SHA.slice(0, 7)}` : "");

// The label the PWA update toast shows for the incoming build. It also lands
// in the generated `sw.js`, so the worker's bytes change every deploy; local
// builds append a timestamp to keep that per-build uniqueness.
const version = process.env.GITHUB_SHA
  ? buildLabel
  : `${buildLabel}+${new Date().toISOString()}`;

// A build for the DESKTOP SHELL (tauri/), set by `tauri/scripts/bundle-web.mjs`.
//
// It changes exactly one thing, and it is about the medium rather than the
// audience: the service worker is left out (`serviceWorker: false` below —
// everything else `appPwa` writes into the `<head>` still applies). A desktop
// build has no deployment to discover an update from — a new version arrives
// as a new binary — so a worker here would precache a copy of files already on
// local disk and then serve the page from ITS copy. `__SHELL_BUILD__` carries
// the same fact into the app, where it switches off the update prompt that has
// nothing left to prompt about.
const shellBuild = process.env.VITE_SHELL_BUILD === "on";

// A build for the PHONE WRAPPER (native/), set by `native/scripts/bundle-web.mjs`.
// With `__SHELL_BUILD__` it marks every build that is not the website, and
// what it changes is about the channel rather than the medium: an app from a
// store carries no link back to the source (owner decision D17) — no "Source
// code" or "Report an issue", no web-edition address. Both are compile-time
// constants, so the About entry and its URLs are folded out of those bundles
// rather than hidden, and `websiteOnly` below drops the rest.
const nativeBuild = process.env.VITE_NATIVE_BUILD === "on";
const appBuild = shellBuild || nativeBuild;

// The name the app calls itself (`src/app/appName.ts`): the store listing's
// name in the phone build, which `native/scripts/bundle-web.mjs` passes as
// `APP_DISPLAY_NAME`; the project's own name everywhere else.
const appName = resolveAppName({
  nativeBuild,
  displayName: process.env.APP_DISPLAY_NAME,
});

// The document title follows it, so nothing in the phone build's page still
// calls the app by the project name.
function titled(name: string): Plugin {
  return {
    name: "app-name-title",
    transformIndexHtml(html) {
      return html.replace(/<title>[^<]*<\/title>/, `<title>${name}</title>`);
    },
  };
}

// What only the website carries, left out of an app build (D17): the Open
// Graph and Twitter tags in `index.html` that point at the web edition's
// address, and the two public files that exist for them and for Pages — the
// share card (`og.png`) and the custom-domain file (`CNAME`). The bundle
// scripts refuse a webroot that still names the site's owner.
function websiteOnly(): Plugin {
  let outDir = "";
  return {
    name: "website-only",
    apply: "build",
    configResolved(config) {
      outDir = resolve(config.root, config.build.outDir);
    },
    transformIndexHtml(html) {
      return html.replace(
        /[ \t]*<meta\b[^>]*\bcontent="https?:\/\/[^"]*"[^>]*>\n?/g,
        "",
      );
    },
    closeBundle() {
      for (const file of ["CNAME", "og.png"]) {
        rmSync(resolve(outDir, file), { force: true });
      }
    },
  };
}

export default defineConfig({
  base,
  // No size budgets, by owner decision: this only keeps Vite's warning quiet.
  build: { chunkSizeWarningLimit: 100_000 },
  define: {
    __SHELL_BUILD__: JSON.stringify(shellBuild),
    __NATIVE_BUILD__: JSON.stringify(nativeBuild),
    __APP_NAME__: JSON.stringify(appName),
    __APP_VERSION__: JSON.stringify(appVersion),
    __BUILD_LABEL__: JSON.stringify(buildLabel),
    __BUILD_COMMIT__: JSON.stringify(commit),
    __BUILD_NUMBER__: JSON.stringify(buildNumber),
  },
  // `appPwa` only applies on build, so dev registers no worker.
  //
  // The runtime is Preact: `@preact/preset-vite` compiles JSX against
  // `preact/jsx-runtime` and aliases `react` / `react-dom` onto
  // `preact/compat`, so both this app's `import … from "react"` lines and the
  // pre-built framework chunks resolve to Preact. See `docs/architecture.md`.
  plugins: [
    preact(),
    tailwindcss(),
    appPwa({ base, version, ignorePaths, serviceWorker: !shellBuild }),
    ...(appBuild ? [websiteOnly()] : []),
    titled(appName),
  ],
});
