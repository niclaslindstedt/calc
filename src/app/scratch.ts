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
// The two halves want opposite things from a failure, which is exactly the
// split the framework's store handles draw. The tape is **best-effort**:
// private windows, a denied quota and browsers with IndexedDB switched off
// all resolve to "nothing there" rather than throwing, and the tape in memory
// is unaffected either way. The backend is **strict** — it is where a named
// session *lives*, so a write that does not land has to surface as a failed
// save rather than a silent loss, and its calls reject.
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

const db = createIdbDatabase({
  // Namespaced the way the framework names its own store
  // (`oss:folder-handles`), so the two never collide in the origin's database
  // list.
  name: "calc:scratch",
  // v2 added `files` — the device storage backend beside the working tape.
  version: 2,
  stores: {
    // One record per namespace, keyed by its slug: each namespace is its own
    // workspace, so each keeps its own working tape.
    tapes: {},
    // The device backend's files, keyed by the same paths a folder or a cloud
    // backend would use (`calculations/<slug>.md`, `<ns>/calculations/…`) —
    // and the path is on the record, so the store reads the key off it.
    files: { keyPath: "path" },
  },
});

const tapes = db.keyedStore<string>("tapes");
const files = db.inlineStore<DeviceFile>("files", { strict: true });

/**
 * The working tape this device last held for `namespaceSlug`, or null when
 * there is none (a first visit, a cleared tape, or no usable IndexedDB).
 */
export async function readScratch(
  namespaceSlug: string,
): Promise<Session | null> {
  const text = await tapes.get(namespaceSlug);
  return typeof text === "string" ? parseSessionMarkdown(text) : null;
}

/** Keep `session` as this device's working tape for `namespaceSlug`. */
export async function writeScratch(
  namespaceSlug: string,
  session: Session,
): Promise<void> {
  await tapes.set(namespaceSlug, sessionToMarkdown(session));
}

/**
 * Forget the working tape for `namespaceSlug` — it was cleared, or it has
 * become a file in the storage backend and no longer needs a device copy.
 */
export async function clearScratch(namespaceSlug: string): Promise<void> {
  await tapes.delete(namespaceSlug);
}

/**
 * A `FileStore` over this device's IndexedDB — the backend `store.ts` binds
 * `createSessionStore` to when the user has connected nothing else. It holds
 * exactly what a folder would hold, under exactly the same paths, so a
 * session saved here is the same document a folder or a cloud would take.
 */
export function deviceFileStore(): FileStore {
  return {
    async list() {
      const all = await files.getAll();
      return all.map((file) => ({
        path: file.path,
        rev: String(file.updatedAt),
      }));
    },
    async read(path) {
      const file = await files.get(path);
      return file ? file.text : null;
    },
    async write(path, text) {
      await files.put({ path, text, updatedAt: Date.now() });
    },
    async remove(path) {
      await files.delete(path);
    },
  };
}
