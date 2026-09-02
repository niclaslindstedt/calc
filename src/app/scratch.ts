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
// Every call is best-effort: private windows, a denied quota and browsers
// with IndexedDB switched off all resolve to "nothing there" rather than
// throwing. The tape in memory is unaffected either way.

import { parseSessionMarkdown, sessionToMarkdown } from "./codec.ts";
import type { Session } from "./session.ts";

// Namespaced the way the framework names its own store (`oss:folder-handles`),
// so the two never collide in the origin's database list.
const DB_NAME = "calc:scratch";
const DB_VERSION = 1;
// One record per namespace, keyed by its slug: each namespace is its own
// workspace, so each keeps its own working tape.
const STORE_NAME = "tapes";

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
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    // Another tab holding an older version open: leave that tab's copy alone
    // rather than fighting it for the upgrade.
    request.onblocked = () => resolve(null);
  });
  return dbPromise;
}

// Run one request against the store, resolving to null on any failure.
function run<T>(
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
          const tx = db.transaction(STORE_NAME, mode);
          const req = request(tx.objectStore(STORE_NAME));
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
          tx.onabort = () => resolve(null);
        } catch {
          resolve(null);
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
  const text = await run<string>("readonly", (store) =>
    store.get(namespaceSlug),
  );
  return typeof text === "string" ? parseSessionMarkdown(text) : null;
}

/** Keep `session` as this device's working tape for `namespaceSlug`. */
export async function writeScratch(
  namespaceSlug: string,
  session: Session,
): Promise<void> {
  await run("readwrite", (store) =>
    store.put(sessionToMarkdown(session), namespaceSlug),
  );
}

/**
 * Forget the working tape for `namespaceSlug` — it was cleared, or it has
 * become a file in the storage backend and no longer needs a device copy.
 */
export async function clearScratch(namespaceSlug: string): Promise<void> {
  await run("readwrite", (store) => store.delete(namespaceSlug));
}
