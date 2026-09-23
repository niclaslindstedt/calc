// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The iCloud Drive `FileStore` (`icloudFileStore` in `src/app/store.ts`).
//
// The store is thin, and that is why it is worth pinning: every saved session
// goes through it, and the host behind it is code outside the bundle that
// answers with whatever it chose to send.

import { describe, expect, it } from "vitest";

import type { ICloudHost } from "../src/app/icloudHost.ts";
import { icloudFileStore } from "../src/app/store.ts";

/** An in-memory host: the container as a map of path to text. */
function fakeHost(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  const host: ICloudHost = {
    version: 1,
    status: async () => "ready",
    list: async () =>
      [...files.keys()].map((path) => ({ path, rev: `${path.length}` })),
    read: async (path) => files.get(path) ?? null,
    write: async (path, text) => {
      files.set(path, text);
    },
    readBytes: async () => null,
    writeBytes: async () => {},
    remove: async (path) => {
      files.delete(path);
    },
  };
  return { host, files };
}

describe("the iCloud session store", () => {
  it("lists what the host holds, with revisions", async () => {
    const { host } = fakeHost({ "calculations/budget.md": "# Budget" });
    await expect(icloudFileStore(host).list()).resolves.toEqual([
      { path: "calculations/budget.md", rev: "22" },
    ]);
  });

  it("reads a missing file as nothing, not as an error", async () => {
    // This is what a first launch sees; an error here would be a failed load.
    const { host } = fakeHost();
    await expect(
      icloudFileStore(host).read("calculations/x.md"),
    ).resolves.toBeNull();
  });

  it("writes text through unchanged", async () => {
    const { host, files } = fakeHost();
    const store = icloudFileStore(host);
    // Non-ASCII on purpose: a session's label is arbitrary user text.
    await store.write("calculations/räkning.md", "# Räkning\n\n2 × 3 = 6\n");
    expect(await store.read("calculations/räkning.md")).toBe(
      "# Räkning\n\n2 × 3 = 6\n",
    );
    expect(files.has("calculations/räkning.md")).toBe(true);
  });

  it("drops a malformed listing row rather than the whole listing", async () => {
    const { host } = fakeHost();
    const broken: ICloudHost = {
      ...host,
      list: async () => [{ path: "a.md", rev: "1" }, { path: "" }] as never,
    };
    await expect(icloudFileStore(broken).list()).resolves.toEqual([
      { path: "a.md", rev: "1" },
    ]);
  });

  it("removes a file", async () => {
    const { host, files } = fakeHost({ "a.md": "x" });
    await icloudFileStore(host).remove("a.md");
    expect(files.size).toBe(0);
  });
});
