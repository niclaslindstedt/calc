// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// Cache-naming contract shared by the browser (usePwaUpdate) and the build
// (pwa-plugin.ts). Imported from both sides, so it must stay free of other
// imports and of anything that only exists in one environment.

// Derive the Cache Storage id for a deploy channel from its Vite base path.
// `/` → "calc", `/preview/` → "calc-preview", `/branch/x/` → "calc-branch-x" —
// each channel owns a distinct precache so installing one never evicts
// another's offline copy.
export function cacheIdForBase(base: string): string {
  const slug = base.replace(/^\/+|\/+$/g, "").replace(/\W+/g, "-");
  return slug ? `calc-${slug}` : "calc";
}
