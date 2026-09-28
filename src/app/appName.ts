// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The name the built app calls itself. Imported by the build
// (`vite.config.ts`, which hands the result to the app as `__APP_NAME__`) and
// by the tests, so it must stay free of other imports and of anything that
// only exists in one environment.

/** The project's own name: the website's, the desktop app's, and a plain
 *  checkout's. */
export const PROJECT_NAME = "Calc";

/**
 * The phone build is the one that ships under a store listing, so it — and
 * only it — takes the listing's name from `APP_DISPLAY_NAME`, the variable
 * `native/app.config.js` reads for the name under the icon. The name inside
 * the app then matches the tile outside it. Unset, it is the project name, so
 * a checkout builds with nothing configured.
 */
export function resolveAppName(build: {
  nativeBuild: boolean;
  displayName?: string;
}): string {
  return (build.nativeBuild && build.displayName?.trim()) || PROJECT_NAME;
}
