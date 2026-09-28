// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// `make store-preflight` (scripts/store-preflight.mjs), run as the Makefile
// runs it. It is a report, so what is pinned is what it says: the bundle id
// read the way `native/app.config.js` builds it (from `native/identifiers.js`,
// not a literal the config no longer holds), and nothing asked of a
// storefront the listing does not ship on.

import { spawnSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { RULES } from "../native/store/listing.mts";

const root = join(import.meta.dirname, "..");

function preflight(env: Record<string, string>): string {
  const run = spawnSync(
    process.execPath,
    [
      "--experimental-strip-types",
      "--disable-warning=ExperimentalWarning",
      join(root, "scripts", "store-preflight.mjs"),
    ],
    { cwd: root, encoding: "utf8", env: { ...process.env, ...env } },
  );
  expect(run.stderr).toBe("");
  return run.stdout;
}

describe("store-preflight", () => {
  it("reads the bundle id the way app.config.js builds it", () => {
    const out = preflight({ APP_BUNDLE_ID: "se.example.preflight" });
    expect(out).toContain("bundle id se.example.preflight");
    expect(out).not.toContain("could not read BUNDLE_ID");
    expect(out).not.toContain("identifiers.js could not be loaded");
  });

  it("asks for no capture a storefront the listing skips would need", () => {
    const out = preflight({});
    if (!RULES.storefronts.macAppStore) {
      expect(out).not.toContain("Mac App Store screenshots");
    }
    if (!RULES.storefronts.steam) {
      expect(out).not.toContain("Steam screenshots");
    }
  });
});
