// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The environment the phone app's web build runs in (`bundle-web.mjs`).
//
// Two things mark it as the phone build. `VITE_NATIVE_BUILD=on` is about the
// channel: an app from a store carries no link back to the source (owner
// decision D17). `APP_DISPLAY_NAME` is the store listing's name — the same
// variable `identifiers.js` reads for the name under the icon — so the app
// calls itself inside what the tile says outside (`src/app/appName.ts`).
// Unset, the page keeps the project's own name, which is right for a plain
// checkout; a `production` bundle is headed for a store, so it refuses to be
// built without the listing's name, as `identifiers.js` refuses the config.
//
// Separate from the script so the root suite can test it
// (tests/native_web_build_test.ts) without building anything.

/**
 * @param {Record<string, string | undefined>} env the caller's environment
 * @param {string} profile the EAS profile the bundle is for
 * @returns {Record<string, string | undefined>}
 */
export function webBuildEnv(env, profile) {
  const displayName = env.APP_DISPLAY_NAME?.trim() ?? "";
  if (profile === "production" && !displayName) {
    throw new Error(
      "APP_DISPLAY_NAME is not set. A production bundle names the app inside " +
        "it after the store listing — pass the same APP_DISPLAY_NAME the EAS " +
        "build gets (native/RELEASING.md).",
    );
  }
  const out = { ...env, VITE_NATIVE_BUILD: "on" };
  if (displayName) out.APP_DISPLAY_NAME = displayName;
  else delete out.APP_DISPLAY_NAME;
  return out;
}
