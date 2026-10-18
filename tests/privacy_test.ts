// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The privacy note under Settings → Privacy (`src/app/privacy.ts`,
// `PrivacyNote.tsx`): every build links to the full policy, and each build's
// summary says what is true of that build. The phone app's names nothing that
// exists only outside it.
//
// The summary is chosen when privacy.ts loads, so each case stubs the phone
// flag and loads the module fresh. The last cases build the phone app and the
// website for real and read what ships.

import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { webBuildEnv } from "../native/scripts/web-build-env.mjs";
import { assertNoSourceLink } from "../native/scripts/webroot-checks.mjs";

const root = join(import.meta.dirname, "..");
const POLICY = "https://apps.agilator.se/calc/privacy/";

async function loadPrivacy(nativeBuild: string) {
  vi.stubEnv("VITE_NATIVE_BUILD", nativeBuild);
  vi.resetModules();
  return import("../src/app/privacy.ts");
}

afterEach(() => {
  vi.unstubAllEnvs();
});

// What the phone app's own words must never name: another edition, where it
// is hosted, the providers it does not offer, or the wording the owner ruled
// out.
const OTHER_EDITION =
  /\bweb\b|website|browser|github|\bpwa\b|desktop|dropbox|folder you pick|no account/i;

describe("the privacy policy link", () => {
  it("is the app's page on apps.agilator.se, in every build", async () => {
    for (const flag of ["on", ""]) {
      const privacy = await loadPrivacy(flag);
      expect(privacy.PRIVACY_POLICY_URL).toBe(POLICY);
    }
  });
});

describe("the phone app's summary", () => {
  it("says what stays where, and what is not there", async () => {
    const { PRIVACY_SUMMARY } = await loadPrivacy("on");
    expect(PRIVACY_SUMMARY).toContain("on this device");
    expect(PRIVACY_SUMMARY).toContain("your own iCloud Drive");
    expect(PRIVACY_SUMMARY).toContain("sends nothing when it opens");
    expect(PRIVACY_SUMMARY).toContain("nothing to sign up for");
    expect(PRIVACY_SUMMARY).toMatch(/no analytics, no ads and no AI/);
  });

  it("names no other edition", async () => {
    const { PRIVACY_SUMMARY } = await loadPrivacy("on");
    expect(PRIVACY_SUMMARY).not.toMatch(OTHER_EDITION);
  });
});

describe("the website's and the desktop app's summary", () => {
  it("names the storage they offer, and no iCloud", async () => {
    const { PRIVACY_SUMMARY } = await loadPrivacy("");
    expect(PRIVACY_SUMMARY).toContain("on this device");
    expect(PRIVACY_SUMMARY).toContain("a folder you pick");
    expect(PRIVACY_SUMMARY).toContain("your own Dropbox");
    expect(PRIVACY_SUMMARY).not.toMatch(/icloud|no account/i);
    expect(PRIVACY_SUMMARY).toMatch(/no analytics, no ads and no AI/);
  });
});

/** Every file under `dir`, recursively, as path → bytes. */
function webroot(dir: string, prefix = ""): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {};
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) Object.assign(out, webroot(dir, path));
    else out[path] = readFileSync(join(dir, path));
  }
  return out;
}

/** Build the site with `env` on top of a clean environment and return its
 *  JavaScript and HTML as one text, and its files. */
function build(env: Record<string, string | undefined>) {
  const out = mkdtempSync(join(tmpdir(), "calc-privacy-"));
  try {
    const clean = Object.fromEntries(
      Object.entries(process.env).filter(
        ([key]) =>
          key !== "NODE_ENV" &&
          !key.startsWith("VITEST") &&
          !key.startsWith("VITE_"),
      ),
    );
    execFileSync(
      process.execPath,
      [
        join("node_modules", "vite", "bin", "vite.js"),
        "build",
        "--outDir",
        out,
        "--emptyOutDir",
        "--logLevel",
        "error",
      ],
      { cwd: root, env: { ...clean, ...env }, stdio: "pipe" },
    );
    const files = webroot(out);
    const text = Object.entries(files)
      .filter(([path]) => /\.(?:html|js)$/.test(path))
      .map(([, bytes]) => new TextDecoder().decode(bytes))
      .join("\n");
    return { files, text };
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

// A bundle is a megabyte on one line, so a miss is reported by name, not by
// printing it.
function carries(text: string, phrases: Record<string, string>) {
  return Object.fromEntries(
    Object.entries(phrases).map(([name, phrase]) => [
      name,
      text.includes(phrase),
    ]),
  );
}

describe("the real builds", () => {
  it("carry the link and the phone app's own summary in the phone app", async () => {
    const phone = await loadPrivacy("on");
    const site = await loadPrivacy("");
    const { files, text } = build(
      webBuildEnv({ APP_DISPLAY_NAME: "Nird Calc" }, "preview"),
    );
    expect(
      carries(text, {
        policy: POLICY,
        link: "Read the full privacy policy",
        phoneSummary: phone.PRIVACY_SUMMARY,
        siteSummary: site.PRIVACY_SUMMARY,
      }),
    ).toEqual({
      policy: true,
      link: true,
      phoneSummary: true,
      siteSummary: false,
    });
    expect(() => assertNoSourceLink(files)).not.toThrow();
  }, 120_000);

  it("carry the link and the website's summary on the website", async () => {
    const phone = await loadPrivacy("on");
    const site = await loadPrivacy("");
    const { text } = build({});
    expect(
      carries(text, {
        policy: POLICY,
        link: "Read the full privacy policy",
        phoneSummary: phone.PRIVACY_SUMMARY,
        siteSummary: site.PRIVACY_SUMMARY,
      }),
    ).toEqual({
      policy: true,
      link: true,
      phoneSummary: false,
      siteSummary: true,
    });
  }, 120_000);
});
