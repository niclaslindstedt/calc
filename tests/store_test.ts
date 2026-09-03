// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The markdown binding over a `FileStore`: which paths a namespace claims, and
// what `clearNamespace` is allowed to take with it. That last one runs when the
// device hands its sessions to a backend the user has just connected — it
// deletes files, so the namespace boundary it respects is worth a test.

import { describe, expect, it } from "vitest";

import type { FileStore } from "@niclaslindstedt/oss-framework/storage";

import { createSessionStore, moveNamespace } from "../src/app/store.ts";
import { newSession, type Session } from "../src/app/session.ts";

// A `FileStore` that is just a Map — the same seam the folder and cloud
// backends sit behind.
function memoryStore(seed: Record<string, string> = {}) {
  const files = new Map<string, string>(Object.entries(seed));
  const store: FileStore = {
    list: () => Promise.resolve([...files.keys()].map((path) => ({ path }))),
    read: (path) => Promise.resolve(files.get(path) ?? null),
    write: (path, text) => {
      files.set(path, text);
      return Promise.resolve();
    },
    remove: (path) => {
      files.delete(path);
      return Promise.resolve();
    },
  };
  return { store, files };
}

// Fixed ids, because the file stem carries the last six characters of one —
// `<slug>-<id6>.md` is what keeps two sessions of the same name apart.
function named(title: string, id: string): Session {
  return { ...newSession(1_700_000_000_000), id, title };
}

describe("createSessionStore", () => {
  it("writes the default namespace at the store root", async () => {
    const { store, files } = memoryStore();
    await createSessionStore(store, "default").saveSession(
      named("Groceries", "aaaaaa"),
      [],
    );
    expect([...files.keys()]).toEqual(["calculations/groceries-aaaaaa.md"]);
  });

  it("prefixes a non-default namespace with its slug", async () => {
    const { store, files } = memoryStore();
    await createSessionStore(store, "work").saveSession(
      named("Invoices", "bbbbbb"),
      [],
    );
    expect([...files.keys()]).toEqual(["work/calculations/invoices-bbbbbb.md"]);
  });

  it("round-trips a saved session through list()", async () => {
    const { store } = memoryStore();
    const sessions = createSessionStore(store, "default");
    const session = named("Groceries", "aaaaaa");
    await sessions.saveSession(session, []);
    const listed = await sessions.list();
    expect(listed.sessions.map((s) => s.title)).toEqual(["Groceries"]);
    expect(listed.sessions[0]?.id).toBe(session.id);
  });

  it("clearNamespace takes the namespace's files and nothing else", async () => {
    const { store, files } = memoryStore({ "notes/keep.md": "untouched" });
    const fallback = createSessionStore(store, "default");
    const work = createSessionStore(store, "work");
    await fallback.saveSession(named("Groceries", "aaaaaa"), []);
    await work.saveSession(named("Invoices", "bbbbbb"), []);
    await work.saveFolders([{ id: "f-1", name: "Clients" }]);

    await work.clearNamespace();

    expect([...files.keys()].sort()).toEqual([
      "calculations/groceries-aaaaaa.md",
      "notes/keep.md",
    ]);
    expect((await work.list()).sessions).toEqual([]);
  });

  it("clearNamespace on the default namespace spares the other namespaces", async () => {
    const { store, files } = memoryStore();
    const fallback = createSessionStore(store, "default");
    await fallback.saveSession(named("Groceries", "aaaaaa"), []);
    await createSessionStore(store, "work").saveSession(
      named("Invoices", "bbbbbb"),
      [],
    );

    await fallback.clearNamespace();

    expect([...files.keys()]).toEqual(["work/calculations/invoices-bbbbbb.md"]);
  });
});

describe("moveNamespace", () => {
  it("hands every session over and leaves the source empty", async () => {
    const device = memoryStore();
    const backend = memoryStore();
    const from = createSessionStore(device.store, "default");
    const to = createSessionStore(backend.store, "default");
    await from.saveSession(named("Groceries", "aaaaaa"), []);
    await from.saveSession(named("Rent", "bbbbbb"), []);

    const result = await moveNamespace(from, to);

    expect(result?.moved.map((s) => s.title).sort()).toEqual([
      "Groceries",
      "Rent",
    ]);
    expect([...device.files.keys()]).toEqual([]);
    expect((await to.list()).sessions.map((s) => s.title).sort()).toEqual([
      "Groceries",
      "Rent",
    ]);
  });

  it("leaves a session the destination already holds as the destination has it", async () => {
    const device = memoryStore();
    const backend = memoryStore();
    const from = createSessionStore(device.store, "default");
    const to = createSessionStore(backend.store, "default");
    await from.saveSession(named("Stale", "aaaaaa"), []);
    await to.saveSession(named("Fresh", "aaaaaa"), []);

    const result = await moveNamespace(from, to);

    expect(result?.moved).toEqual([]);
    // The device's copy is dropped either way — it has somewhere else to be.
    expect([...device.files.keys()]).toEqual([]);
    expect((await to.list()).sessions.map((s) => s.title)).toEqual(["Fresh"]);
  });

  it("merges folders by id, the destination's names winning", async () => {
    const device = memoryStore();
    const backend = memoryStore();
    const from = createSessionStore(device.store, "default");
    const to = createSessionStore(backend.store, "default");
    await from.saveFolders([
      { id: "f-1", name: "Device name" },
      { id: "f-2", name: "Only on the device" },
    ]);
    await to.saveFolders([{ id: "f-1", name: "Backend name" }]);

    const result = await moveNamespace(from, to);

    expect(result?.folders).toEqual([
      { id: "f-1", name: "Backend name" },
      { id: "f-2", name: "Only on the device" },
    ]);
    expect((await to.list()).folders).toEqual(result?.folders);
  });

  it("touches nothing, and says so, when the source is empty", async () => {
    const backend = memoryStore();
    const to = createSessionStore(backend.store, "default");
    await to.saveSession(named("Groceries", "aaaaaa"), []);
    const started = { yes: false };

    const result = await moveNamespace(
      createSessionStore(memoryStore().store, "default"),
      to,
      () => (started.yes = true),
    );

    expect(result).toBeNull();
    expect(started.yes).toBe(false);
    expect([...backend.files.keys()]).toEqual([
      "calculations/groceries-aaaaaa.md",
    ]);
  });

  it("only clears the source once the destination has everything", async () => {
    const device = memoryStore();
    const backend = memoryStore();
    const from = createSessionStore(device.store, "default");
    const to = createSessionStore(backend.store, "default");
    await from.saveSession(named("Groceries", "aaaaaa"), []);
    // A destination that refuses the write must not cost the device its copy.
    backend.store.write = () => Promise.reject(new Error("backend is down"));

    await expect(moveNamespace(from, to)).rejects.toThrow("backend is down");
    expect([...device.files.keys()]).toEqual([
      "calculations/groceries-aaaaaa.md",
    ]);
  });

  it("moves a non-default namespace under its own prefix", async () => {
    const device = memoryStore();
    const backend = memoryStore();
    const from = createSessionStore(device.store, "work");
    const to = createSessionStore(backend.store, "work");
    await from.saveSession(named("Invoices", "bbbbbb"), []);
    // A session in another namespace is not this move's to take.
    await createSessionStore(device.store, "default").saveSession(
      named("Groceries", "aaaaaa"),
      [],
    );

    await moveNamespace(from, to);

    expect([...device.files.keys()]).toEqual([
      "calculations/groceries-aaaaaa.md",
    ]);
    expect([...backend.files.keys()]).toEqual([
      "work/calculations/invoices-bbbbbb.md",
    ]);
  });
});
