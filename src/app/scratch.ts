// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The scratch tape, kept on this device. A scratch session is not a file —
// it becomes one only when the user names it — so nothing in store.ts
// would remember it: closing the tab would take the tape with it, and a
// calculator whose history evaporates is not a history at all. This module
// is the floor under that: whatever the working tape holds is mirrored here
// after every change and read back on the next visit, so a tape the user
// never clears simply stays.
//
// It is IndexedDB rather than localStorage on purpose. A tape is a document,
// and documents never go in localStorage (`calc:*` holds settings and
// pointers only — see docs/architecture.md); an unbounded one would also run
// localStorage's few megabytes out, and it would do it synchronously on the
// UI thread. IndexedDB has neither problem.
//
// The record is the session's own markdown (codec.ts), not a bespoke shape,
// so the device copy is the same document the storage backend would hold —
// one format, one round trip, already covered by tests/codec_test.ts.
//
// The same database is also the app's device storage backend. "This device"
// is not the absence of storage: a session named while no folder or cloud is
// connected is still a file, it simply lives here — one record per path, the
// same markdown layout `store.ts` writes everywhere else, so the sidebar can
// list it and connecting a backend later can move it out wholesale.
//
// The tape's own calls are best-effort: private windows, a denied quota and
// browsers with IndexedDB switched off all resolve to "nothing there" rather
// than throwing. The tape in memory is unaffected either way. The backend
// below cannot be so forgiving — it is where a named session *lives*, so a
// write that does not land has to surface as a failed save rather than a
// silent loss, and its calls reject.

import type { FileStore } from "@niclaslindstedt/oss-framework/storage";

import { parseSessionMarkdown, sessionToMarkdown } from "./codec.ts";
import type { Session } from "./session.ts";

// Namespaced the way the framework names its own store (`oss:folder-handles`),
// so the two never collide in the origin's database list.
const DB_NAME = "calc:scratch";
// v2 added `files` — the device storage backend beside the working tape.
const DB_VERSION = 2;
// One record per namespace, keyed by its slug: each namespace is its own
// workspace, so each keeps its own working tape.
const STORE_NAME = "tapes";
// The device backend's files, keyed by the same paths a folder or a cloud
// backend would use (`calculations/<slug>.md`, `<ns>/calculations/…`).
const FILES_STORE = "files";

// Opened once and shared. The promise resolves to null on any environment
// that has no usable IndexedDB — the node test environment included — which
// turns every operation below into a silent no-op.
let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    let request: IDBOpenDBRequest;
    try {
      request = indexedDB.open(DB_NAME, DB_VERSION);
    } catch {
      resolve(null);
      return;
    }
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
      if (!db.objectStoreNames.contains(FILES_STORE)) {
        db.createObjectStore(FILES_STORE, { keyPath: "path" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    // Another tab holding an older version open: leave that tab's copy alone
    // rather than fighting it for the upgrade.
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

// Run one request against an object store, resolving to null on any failure.
function run<T>(
  storeName: string,
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) {
          resolve(null);
          return;
        }
        try {
          const tx = db.transaction(storeName, mode);
          const req = request(tx.objectStore(storeName));
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

// The same, for the calls that own a document rather than mirror one: a
// failure is reported instead of swallowed, so the save status can show it.
function runStrict<T>(
  mode: IDBTransactionMode,
  request: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        if (!db) {
          reject(new Error("This browser has no usable IndexedDB"));
          return;
        }
        try {
          const tx = db.transaction(FILES_STORE, mode);
          const req = request(tx.objectStore(FILES_STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () =>
            reject(req.error ?? new Error("Device storage request failed"));
          tx.onabort = () =>
            reject(tx.error ?? new Error("Device storage transaction aborted"));
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
      }),
  );
}

/**
 * The working tape this device last held for `namespaceSlug`, or null when
 * there is none (a first visit, a cleared tape, or no usable IndexedDB).
 */
export async function readScratch(
  namespaceSlug: string,
): Promise<Session | null> {
  const text = await run<string>(STORE_NAME, "readonly", (store) =>
    store.get(namespaceSlug),
  );
  return typeof text === "string" ? parseSessionMarkdown(text) : null;
}

/** Keep `session` as this device's working tape for `namespaceSlug`. */
export async function writeScratch(
  namespaceSlug: string,
  session: Session,
): Promise<void> {
  await run(STORE_NAME, "readwrite", (store) =>
    store.put(sessionToMarkdown(session), namespaceSlug),
  );
}

/**
 * Forget the working tape for `namespaceSlug` — it was cleared, or it has
 * become a file in the storage backend and no longer needs a device copy.
 */
export async function clearScratch(namespaceSlug: string): Promise<void> {
  await run(STORE_NAME, "readwrite", (store) => store.delete(namespaceSlug));
}

// ---------------------------------------------------------------------------
// The device storage backend
// ---------------------------------------------------------------------------

// One file, as the `files` object store holds it. `updatedAt` is only ever
// handed back as the `FileStore` revision token, which nothing interprets.
type DeviceFile = { path: string; text: string; updatedAt: number };

/**
 * A `FileStore` over this device's IndexedDB — the backend `store.ts` binds
 * `createSessionStore` to when the user has connected nothing else. It holds
 * exactly what a folder would hold, under exactly the same paths, so a
 * session saved here is the same document a folder or a cloud would take.
 */
export function deviceFileStore(): FileStore {
  return {
    async list() {
      const files = await runStrict<DeviceFile[]>("readonly", (store) =>
        store.getAll(),
      );
      return files.map((file) => ({
        path: file.path,
        rev: String(file.updatedAt),
      }));
    },
    async read(path) {
      const file = await runStrict<DeviceFile | undefined>(
        "readonly",
        (store) => store.get(path),
      );
      return file ? file.text : null;
    },
    async write(path, text) {
      const file: DeviceFile = { path, text, updatedAt: Date.now() };
      await runStrict("readwrite", (store) => store.put(file));
    },
    async remove(path) {
      await runStrict("readwrite", (store) => store.delete(path));
    },
  };
}
