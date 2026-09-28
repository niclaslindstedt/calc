// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The name the phone app calls itself: the store listing's, carried from the
// build variable `native/app.config.js` reads for the name under the icon,
// through the phone build's web bundle (`native/scripts/web-build-env.mjs`),
// into the page (`src/app/appName.ts`).
//
// A break anywhere on that path is silent — the app just says "Calc" under a
// tile that says the listing's name — so each link is pinned here.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { webBuildEnv } from "../native/scripts/web-build-env.mjs";
import {
  assertNoServiceWorker,
  assertNoSourceLink,
} from "../native/scripts/webroot-checks.mjs";
import { PROJECT_NAME, resolveAppName } from "../src/app/appName.ts";

const root = join(import.meta.dirname, "..");

describe("the phone build's environment", () => {
  it("marks the build and carries the listing's name", () => {
    const env = webBuildEnv(
      { APP_DISPLAY_NAME: "  Nird Calc ", PATH: "/bin" },
      "preview",
    );
    expect(env.VITE_NATIVE_BUILD).toBe("on");
    expect(env.APP_DISPLAY_NAME).toBe("Nird Calc");
    expect(env.PATH).toBe("/bin");
  });

  it("leaves the name to the project when it is unset outside production", () => {
    for (const name of [undefined, "", "   "]) {
      const env = webBuildEnv({ APP_DISPLAY_NAME: name }, "development");
      expect(env.VITE_NATIVE_BUILD).toBe("on");
      expect("APP_DISPLAY_NAME" in env).toBe(false);
    }
  });

  it("refuses a production bundle without the listing's name", () => {
    expect(() => webBuildEnv({}, "production")).toThrow(/APP_DISPLAY_NAME/);
    expect(() =>
      webBuildEnv({ APP_DISPLAY_NAME: "Nird Calc" }, "production"),
    ).not.toThrow();
  });

  it("is given the name by the workflow that bundles for EAS", () => {
    // The bundle step runs before `eas build` and has an env of its own; the
    // name must be in it, not only in the step that queues the build.
    const workflow = readFileSync(
      join(root, ".github", "workflows", "native.yml"),
      "utf8",
    );
    const step = workflow
      .split("\n      - ")
      .find((s) => s.startsWith("name: Bundle the web app"));
    expect(step).toContain("APP_DISPLAY_NAME: ${{ secrets.APP_DISPLAY_NAME }}");
  });
});

describe("the name the app calls itself", () => {
  it("is the listing's name in the phone build", () => {
    expect(
      resolveAppName({ nativeBuild: true, displayName: " Nird Calc " }),
    ).toBe("Nird Calc");
  });

  it("is the project's name when the phone build has none", () => {
    expect(resolveAppName({ nativeBuild: true })).toBe(PROJECT_NAME);
    expect(resolveAppName({ nativeBuild: true, displayName: " " })).toBe(
      PROJECT_NAME,
    );
  });

  it("is the project's name on the website and the desktop app", () => {
    expect(
      resolveAppName({ nativeBuild: false, displayName: "Nird Calc" }),
    ).toBe(PROJECT_NAME);
  });
});

describe("the phone build's webroot", () => {
  const bytes = (text: string) => new TextEncoder().encode(text);

  it("is a shell build: no service worker, no update prompt", () => {
    expect(webBuildEnv({}, "preview").VITE_SHELL_BUILD).toBe("on");
  });

  it("refuses a service worker", () => {
    const site = { "index.html": bytes("<!doctype html>") };
    expect(() => assertNoServiceWorker(site)).not.toThrow();
    expect(() =>
      assertNoServiceWorker({
        ...site,
        "sw.js": bytes("self.addEventListener"),
      }),
    ).toThrow(/service worker/);
    expect(() =>
      assertNoServiceWorker({ ...site, "preview/sw.js": bytes("") }),
    ).toThrow(/preview\/sw\.js/);
  });

  it("refuses a link back to the source, in any text file", () => {
    const site = { "index.html": bytes("<!doctype html>") };
    expect(() => assertNoSourceLink(site)).not.toThrow();
    expect(() =>
      assertNoSourceLink({
        ...site,
        "assets/app.js": bytes("https://github.com/NiclasLindstedt/calc"),
      }),
    ).toThrow(/assets\/app\.js/);
    expect(() =>
      assertNoSourceLink({ ...site, "icon.png": bytes("niclaslindstedt") }),
    ).not.toThrow();
  });

  it("is checked by the bundle script before it zips", () => {
    const script = readFileSync(
      join(root, "native", "scripts", "bundle-web.mjs"),
      "utf8",
    );
    const zip = script.indexOf("zipSync(files");
    for (const check of [
      "assertNoSourceLink(files)",
      "assertNoServiceWorker(files)",
    ]) {
      expect(script.indexOf(check)).toBeGreaterThan(0);
      expect(script.indexOf(check)).toBeLessThan(zip);
    }
  });
});
