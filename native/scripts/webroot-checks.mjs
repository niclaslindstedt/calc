// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// What `bundle-web.mjs` refuses to pack into `webroot.zip`. The phone app is
// the store build, so a webroot that is really the website — the usual cause
// is `--skip-build` re-zipping whatever the last build left in `dist/` — must
// never reach it.
//
// Separate from the script so the root suite can test it
// (tests/native_web_build_test.ts) without building anything.

const BINARY = /\.(png|ico|jpe?g|webp|gif|woff2?|ttf|otf)$/i;

/** Refuse a webroot that links back to the source (by owner decision): no
 *  GitHub repository, issues, releases or sponsor link, and not the author's
 *  handle anywhere — web-edition address, package name or meta tag included.
 *  The website keeps those; the app has none. Every file but a binary asset is
 *  read, extensionless ones too, so nothing slips past on its suffix.
 *
 *  @param {Record<string, Uint8Array>} files the webroot, path → bytes */
export function assertNoSourceLink(files) {
  const decoder = new TextDecoder();
  for (const [path, bytes] of Object.entries(files)) {
    if (BINARY.test(path)) continue;
    if (decoder.decode(bytes).toLowerCase().includes("niclaslindstedt")) {
      throw new Error(
        `dist/${path} carries a link back to the source ("niclaslindstedt") — ` +
          `the phone app must not. Rebuild through this script (drop ` +
          `--skip-build) so VITE_NATIVE_BUILD=on compiles it out.`,
      );
    }
  }
}

/** Refuse a webroot holding a service worker (`sw.js`). The app is served
 *  from files already on the device and changes only when a new build ships,
 *  so a worker would precache a second copy of them, serve the page from that
 *  copy and prompt for updates that can never come.
 *
 *  @param {Record<string, Uint8Array>} files the webroot, path → bytes */
export function assertNoServiceWorker(files) {
  const worker = Object.keys(files).find(
    (path) => path.split("/").pop() === "sw.js",
  );
  if (worker) {
    throw new Error(
      `dist/${worker} is a service worker — the phone app must not carry one. ` +
        `Rebuild through this script (drop --skip-build) so ` +
        `VITE_SHELL_BUILD=on leaves it out.`,
    );
  }
}
