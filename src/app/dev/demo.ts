// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// `VITE_SEED=demo`: the app boots onto the demo shelf (demoData.ts) instead of
// the reader's own sessions — the live demo, and what the store screenshots
// are taken of.
//
// It swaps the two places a session can come from, and nothing above them:
//
//   - the DEVICE backend becomes an in-memory `FileStore` holding the demo
//     sessions as the same markdown files a folder would hold, written by the
//     same codec — so listing, opening, naming, folders and deleting all run
//     the app's real code over them;
//   - the WORKING TAPE is kept in memory rather than in IndexedDB.
//
// With both swapped, nothing the demo does touches the device's storage: the
// reader's own tape and saved sessions in IndexedDB are neither read nor
// written, and a backend chosen on this device is not connected (see
// `readBackendPreference`). Connecting one from the demo is refused rather
// than allowed to carry the demo shelf into somebody's Dropbox — see
// `useSessions`.
//
// The seed is a BUILD-TIME switch on purpose. A production build never sets
// it, Vite folds the check in `main.tsx` to false, and this module and the
// demo data never reach the bundle; there is no URL or setting that turns it
// on in a shipped app.

import type { FileStore } from "@niclaslindstedt/oss-framework/storage";

import {
  CALCULATIONS_DIR,
  FOLDERS_FILE_NAME,
  serializeFolders,
  sessionFilePath,
  sessionToMarkdown,
} from "../codec.ts";
import { keepTapesInMemory } from "../scratch.ts";
import { setDemoDevice } from "../store.ts";
import { buildDemoSessions, DEMO_FOLDERS } from "./demoData.ts";

/** A `FileStore` over a plain map — what the device backend holds, minus the
 *  device. */
export function memoryFileStore(files: Map<string, string>): FileStore {
  const revs = new Map<string, number>();
  let clock = 0;
  const touch = (path: string) => revs.set(path, ++clock);
  for (const path of files.keys()) touch(path);
  return {
    async list() {
      return [...files.keys()].map((path) => ({
        path,
        rev: String(revs.get(path) ?? 0),
      }));
    },
    async read(path) {
      return files.get(path) ?? null;
    },
    async write(path, text) {
      files.set(path, text);
      touch(path);
    },
    async remove(path) {
      files.delete(path);
      revs.delete(path);
    },
  };
}

/** The demo shelf as the files the default namespace would hold. */
export function demoFiles(now = Date.now()): Map<string, string> {
  const files = new Map<string, string>();
  files.set(
    `${CALCULATIONS_DIR}/${FOLDERS_FILE_NAME}`,
    serializeFolders(DEMO_FOLDERS),
  );
  for (const session of buildDemoSessions(now)) {
    files.set(
      sessionFilePath(session, DEMO_FOLDERS),
      sessionToMarkdown(session),
    );
  }
  return files;
}

/** Point the device backend and the working tape at the demo. Called once,
 *  before the first render. */
export function installDemo(now = Date.now()): void {
  setDemoDevice(memoryFileStore(demoFiles(now)));
  keepTapesInMemory();
}
