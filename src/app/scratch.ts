// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// This device's own IndexedDB: the working tape, and the storage backend a
// named session lives in when nothing else is connected.
//
// The tape comes first. A scratch session is not a file — it becomes one only
// when the user names it — so nothing in store.ts would remember it: closing
// the tab would take the tape with it, and a calculator whose history
// evaporates is not a history at all. Whatever the working tape holds is
// mirrored here after every change and read back on the next visit, so a tape
// the user never clears simply stays.
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
// The two halves want opposite things from a *reported* failure, which is the
// split the framework's store handles draw — but neither may treat a failure
// as an answer. The tape is **best-effort** to write: a denied quota or a
// browser with IndexedDB switched off costs the device copy, not the tape in
// memory. Reading it is not best-effort, because the reader is what decides
// whether this device is still holding a tape, and "I could not tell" must
// never arrive as "there is none" — that answer is what makes the app open a
// fresh tape and clear the record the old one was still sitting in. So both
// halves are opened strict, and a read that fails says so (`unavailable`).
//
// Both stores are declared in one schema because IndexedDB versions the
// database, not the store: a second store opened behind the first's back
// would simply be missing when a transaction asked for it.

import {
  createIdbDatabase,
  type FileStore,
} from "@niclaslindstedt/oss-framework/storage";

import { parseSessionMarkdown, sessionToMarkdown } from "./codec.ts";
import type { Session } from "./session.ts";

// One file, as the `files` object store holds it. `updatedAt` is only ever
// handed back as the `FileStore` revision token, which nothing interprets.
type DeviceFile = { path: string; text: string; updatedAt: number };

// How long to wait before each fresh attempt at a database that just failed.
// Two retries: the failure this exists for is a version upgrade blocked by
// the page we are replacing (see `openHandles`), and that page is gone within
// a moment of the new one asking.
const RETRY_DELAYS_MS = [200, 600];

type Handles = ReturnType<typeof openHandles>;

// Open the database and take a handle on each store. Called again whenever an
// operation fails, and deliberately so: `createIdbDatabase` opens the database
// once and remembers the outcome — a failure included — for the life of the
// handle. An `open` that the previous page blocks (it still holds the older
// version open while the new page loads, which is exactly what an app update's
// reload does) would otherwise poison every read and write until the next
// reload, and the tape would read as gone on the one visit that most needs it.
// A fresh handle opens the database again, by which time the blocker is gone.
function openHandles() {
  const db = createIdbDatabase({
    // Namespaced the way the framework names its own store
    // (`oss:folder-handles`), so the two never collide in the origin's
    // database list.
    name: "calc:scratch",
    // v2 added `files` — the device storage backend beside the working tape.
    version: 2,
    stores: {
      // One record per namespace, keyed by its slug: each namespace is its own
      // workspace, so each keeps its own working tape.
      tapes: {},
      // The device backend's files, keyed by the same paths a folder or a
      // cloud backend would use (`calculations/<slug>.md`,
      // `<ns>/calculations/…`) — and the path is on the record, so the store
      // reads the key off it.
      files: { keyPath: "path" },
    },
  });
  return {
    // Strict on both: an operation that did not happen has to say so rather
    // than resolve to null, which reads as "there was nothing there".
    tapes: db.keyedStore<string>("tapes", { strict: true }),
    files: db.inlineStore<DeviceFile>("files", { strict: true }),
  };
}

let handles = openHandles();

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Run one store operation, reopening the database between attempts. Rejects
 * with the last failure once the retries are spent — every caller below
 * decides for itself what an operation that never landed means.
 */
async function withRetries<T>(op: (h: Handles) => Promise<T>): Promise<T> {
  // Nothing to retry where there is no IndexedDB at all (the node test run, a
  // browser with storage switched off): a second open fails exactly as the
  // first did, and the caller would only wait longer to hear it.
  const retries = typeof indexedDB === "undefined" ? 0 : RETRY_DELAYS_MS.length;
  for (let attempt = 0; ; attempt++) {
    try {
      return await op(handles);
    } catch (err) {
      if (attempt >= retries) throw err;
      await delay(RETRY_DELAYS_MS[attempt]);
      handles = openHandles();
    }
  }
}

/**
 * What this device has to say about the working tape for a namespace.
 *
 * `unavailable` is not `empty`. A tape this device holds but could not hand
 * back is still there, and the caller must leave it alone rather than open a
 * fresh tape over it.
 */
export type ScratchRead =
  | { status: "tape"; session: Session }
  | { status: "empty" }
  | { status: "unavailable" };

/**
 * The working tape this device last held for `namespaceSlug` — or `empty`
 * when there is none (a first visit, a cleared tape), or `unavailable` when
 * the device could not be asked.
 */
export async function readScratch(namespaceSlug: string): Promise<ScratchRead> {
  let text: string | null;
  try {
    text = await withRetries((h) => h.tapes.get(namespaceSlug));
  } catch {
    return { status: "unavailable" };
  }
  if (typeof text !== "string") return { status: "empty" };
  const session = parseSessionMarkdown(text);
  // A record that no longer parses is a record we cannot honour; treating it
  // as an empty tape lets the next write replace it.
  return session ? { status: "tape", session } : { status: "empty" };
}

/**
 * Keep `session` as this device's working tape for `namespaceSlug`. Resolves
 * to whether it landed: the tape in memory is unaffected either way, so the
 * caller is free to ignore it, but the pre-update flush waits on it.
 */
export async function writeScratch(
  namespaceSlug: string,
  session: Session,
): Promise<boolean> {
  try {
    await withRetries((h) =>
      h.tapes.set(namespaceSlug, sessionToMarkdown(session)),
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Forget the working tape for `namespaceSlug` — it was cleared, or it has
 * become a file in the storage backend and no longer needs a device copy.
 */
export async function clearScratch(namespaceSlug: string): Promise<void> {
  try {
    await withRetries((h) => h.tapes.delete(namespaceSlug));
  } catch {
    // Nothing to do about a record we could not remove: it is the tape the
    // user just put away, and the next write to that namespace replaces it.
  }
}

/**
 * A `FileStore` over this device's IndexedDB — the backend `store.ts` binds
 * `createSessionStore` to when the user has connected nothing else. It holds
 * exactly what a folder would hold, under exactly the same paths, so a
 * session saved here is the same document a folder or a cloud would take.
 *
 * Strict, and it stays strict through the retries: this is where a named
 * session *lives*, so a write that never landed has to surface as a failed
 * save rather than a silent loss.
 */
export function deviceFileStore(): FileStore {
  return {
    async list() {
      const all = await withRetries((h) => h.files.getAll());
      return all.map((file) => ({
        path: file.path,
        rev: String(file.updatedAt),
      }));
    },
    async read(path) {
      const file = await withRetries((h) => h.files.get(path));
      return file ? file.text : null;
    },
    async write(path, text) {
      await withRetries((h) =>
        h.files.put({ path, text, updatedAt: Date.now() }),
      );
    },
    async remove(path) {
      await withRetries((h) => h.files.delete(path));
    },
  };
}
