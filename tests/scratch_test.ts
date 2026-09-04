// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The one thing about the device's working tape that can be asserted without
// a browser: what it says when it cannot answer. These tests run in node,
// where `indexedDB` does not exist — the same shape of failure as a private
// window with storage switched off, a denied quota, or the open that an app
// update's reload finds blocked by the page it is replacing.
//
// It matters because the caller acts on the answer. `useSessions` opens a
// fresh tape and clears the device record when the read comes back empty, so
// a failure reported as "there is no tape" is a failure that deletes one.

import { describe, expect, it } from "vitest";

import { clearScratch, readScratch, writeScratch } from "../src/app/scratch.ts";
import { appendEntry, newSession } from "../src/app/session.ts";

describe("readScratch without a usable IndexedDB", () => {
  it("reports that it could not read rather than that there is nothing", async () => {
    const read = await readScratch("default");
    expect(read.status).toBe("unavailable");
    // The distinction the caller keys off: `empty` means the device has no
    // tape, and is the only answer that may lead to the record being cleared.
    expect(read.status).not.toBe("empty");
  });
});

describe("the tape's writes stay best-effort", () => {
  it("says a write did not land instead of throwing", async () => {
    const tape = appendEntry(newSession(), "1 + 1", "2");
    await expect(writeScratch("default", tape)).resolves.toBe(false);
  });

  it("swallows a clear that could not happen", async () => {
    await expect(clearScratch("default")).resolves.toBeUndefined();
  });
});
