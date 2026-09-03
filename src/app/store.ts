// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// Storage: sessions live as markdown files (codec.ts) behind the framework's
// byte-level `FileStore` seam, so the same session store works over this
// device (IndexedDB — scratch.ts), a local folder (File System Access API),
// Dropbox, or Google Drive. localStorage holds *settings and pointers only* —
// backend choice, tokens, namespace registry — never session documents (the
// app's storage rule; see docs/architecture.md).
//
// The device is the one backend that is always there, and the one the app
// falls back to: with nothing connected, a named session is still a file, it
// simply lives in IndexedDB. Connecting a backend moves what the device holds
// into it (see `useSessions`), so "This device" is a place sessions are kept
// rather than a place they wait.

import {
  createDropboxFileStore,
  createFolderFileStore,
  createGdriveFileStore,
  isFolderBackendAvailable,
  loadDirectoryHandle,
  saveDirectoryHandle,
  clearDirectoryHandle,
  ensurePermission,
  type DropboxAuth,
  type FileStore,
} from "@niclaslindstedt/oss-framework/storage";

import {
  CALCULATIONS_DIR,
  FOLDERS_FILE_NAME,
  parseFolders,
  parseSessionMarkdown,
  serializeFolders,
  sessionFilePath,
  sessionToMarkdown,
} from "./codec.ts";
import { deviceFileStore } from "./scratch.ts";
import type { Folder, Session } from "./session.ts";

// ---------------------------------------------------------------------------
// Backend preference (localStorage — settings, not documents)
// ---------------------------------------------------------------------------

export type BackendId = "folder" | "dropbox" | "gdrive";

const BACKEND_KEY = "calc:backend";
const DROPBOX_TOKEN_KEY = "calc:dropbox:token";
const DROPBOX_REFRESH_KEY = "calc:dropbox:refresh";
const GDRIVE_TOKEN_KEY = "calc:gdrive:token";

export const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY ?? "";
export const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID ?? "";
export const DROPBOX_APP_FOLDER =
  import.meta.env.VITE_DROPBOX_APP_FOLDER ?? "Calc";
export const GDRIVE_APP_FOLDER =
  import.meta.env.VITE_GDRIVE_APP_FOLDER ?? "Calc";

export const FOLDER_BACKEND_AVAILABLE = isFolderBackendAvailable();

// What the save glyph calls each place a session can live — woven into
// "Saved to …", so they read as somewhere rather than as product names where
// they can. No backend is not nowhere: it is this device.
const STORAGE_NAMES: Record<BackendId, string> = {
  folder: "your local folder",
  dropbox: "Dropbox",
  gdrive: "Google Drive",
};

export function storageName(backend: BackendId | null): string {
  return backend ? STORAGE_NAMES[backend] : "this device";
}

export function readBackendPreference(): BackendId | null {
  const raw = localStorage.getItem(BACKEND_KEY);
  return raw === "folder" || raw === "dropbox" || raw === "gdrive" ? raw : null;
}

export function writeBackendPreference(backend: BackendId | null): void {
  if (backend) localStorage.setItem(BACKEND_KEY, backend);
  else localStorage.removeItem(BACKEND_KEY);
}

export function readDropboxTokens(): DropboxAuth | null {
  const accessToken = localStorage.getItem(DROPBOX_TOKEN_KEY);
  if (!accessToken) return null;
  return {
    accessToken,
    refreshToken: localStorage.getItem(DROPBOX_REFRESH_KEY),
    onAccessTokenRefreshed: (token) =>
      localStorage.setItem(DROPBOX_TOKEN_KEY, token),
  };
}

export function writeDropboxTokens(
  accessToken: string,
  refreshToken: string | null,
): void {
  localStorage.setItem(DROPBOX_TOKEN_KEY, accessToken);
  if (refreshToken) localStorage.setItem(DROPBOX_REFRESH_KEY, refreshToken);
}

export function readGdriveToken(): string | null {
  return localStorage.getItem(GDRIVE_TOKEN_KEY);
}

export function writeGdriveToken(token: string | null): void {
  if (token) localStorage.setItem(GDRIVE_TOKEN_KEY, token);
  else localStorage.removeItem(GDRIVE_TOKEN_KEY);
}

export function clearBackendState(): void {
  writeBackendPreference(null);
  localStorage.removeItem(DROPBOX_TOKEN_KEY);
  localStorage.removeItem(DROPBOX_REFRESH_KEY);
  localStorage.removeItem(GDRIVE_TOKEN_KEY);
  void clearDirectoryHandle();
}

export { loadDirectoryHandle, saveDirectoryHandle, ensurePermission };

// ---------------------------------------------------------------------------
// FileStore construction
// ---------------------------------------------------------------------------

// The device backend, built once and shared: it holds no connection state, and
// a single instance keeps every caller on the same IndexedDB handle.
const DEVICE_FILE_STORE = deviceFileStore();

export function deviceStore(): FileStore {
  return DEVICE_FILE_STORE;
}

export function folderFileStore(handle: FileSystemDirectoryHandle): FileStore {
  return createFolderFileStore(handle);
}

export function dropboxFileStore(auth: DropboxAuth): FileStore {
  return createDropboxFileStore(auth, {
    appKey: DROPBOX_APP_KEY || undefined,
  });
}

export function gdriveFileStore(token: string): FileStore {
  return createGdriveFileStore(token, { appFolderName: GDRIVE_APP_FOLDER });
}

// ---------------------------------------------------------------------------
// Session store — the markdown binding over a FileStore
// ---------------------------------------------------------------------------

export type SessionStore = {
  // Load the folder registry and every session under the namespace root.
  list(): Promise<{ sessions: Session[]; folders: Folder[] }>;
  // Write one session; reconciles a renamed/moved file away from its old path.
  saveSession(session: Session, folders: readonly Folder[]): Promise<void>;
  removeSession(sessionId: string): Promise<void>;
  saveFolders(folders: readonly Folder[]): Promise<void>;
  // Delete every file the namespace holds. Used once, when the device's
  // sessions have been handed to a backend the user just connected: what has
  // been moved must not also stay behind, or disconnecting would resurrect it.
  clearNamespace(): Promise<void>;
};

// The default namespace stores at the store root; others under `<slug>/`
// (same layout rule as the notes sibling).
function nsPrefix(namespaceSlug: string): string {
  return namespaceSlug === "default" ? "" : `${namespaceSlug}/`;
}

/**
 * Hand everything one store holds to another, and leave the first empty.
 *
 * This is what connecting a backend does with the sessions the device has
 * been keeping. A session the destination already holds under the same id is
 * left exactly as the destination has it — that copy is the one the user's
 * other devices agree on — and the source's is dropped with the rest; folders
 * are merged by id, the destination's names winning. Resolves to what moved
 * and the merged folder list, or null when there was nothing to move at all.
 *
 * `onStart` fires once it is known there *is* something to move and before
 * the first write — the caller's cue to say it is saving, which a move that
 * turns out to be empty should never make it say.
 */
export async function moveNamespace(
  from: SessionStore,
  to: SessionStore,
  onStart?: () => void,
): Promise<{ moved: Session[]; folders: Folder[] } | null> {
  const held = await from.list();
  if (held.sessions.length === 0 && held.folders.length === 0) return null;
  onStart?.();
  const landed = await to.list();
  const landedIds = new Set(landed.sessions.map((s) => s.id));
  const moved = held.sessions.filter((s) => !landedIds.has(s.id));
  const folders = [
    ...landed.folders,
    ...held.folders.filter((f) => !landed.folders.some((g) => g.id === f.id)),
  ];
  if (folders.length !== landed.folders.length) await to.saveFolders(folders);
  for (const session of moved) await to.saveSession(session, folders);
  // Last, and only once every write above has landed: what is dropped here is
  // gone, so it must already exist somewhere else.
  await from.clearNamespace();
  return { moved, folders };
}

export function createSessionStore(
  store: FileStore,
  namespaceSlug: string,
): SessionStore {
  const prefix = nsPrefix(namespaceSlug);
  const foldersPath = `${prefix}${CALCULATIONS_DIR}/${FOLDERS_FILE_NAME}`;
  // Where each loaded session currently lives on disk, so a rename (new
  // slug) or a folder move deletes the stale file after the new one lands.
  const pathsById = new Map<string, string>();

  return {
    async list() {
      const entries = await store.list();
      const sessions: Session[] = [];
      let folders: Folder[] = [];
      pathsById.clear();
      for (const entry of entries) {
        if (!entry.path.startsWith(`${prefix}${CALCULATIONS_DIR}/`)) continue;
        if (entry.path === foldersPath) {
          const text = await store.read(entry.path);
          if (text !== null) folders = parseFolders(text);
          continue;
        }
        if (!entry.path.endsWith(".md")) continue;
        const text = await store.read(entry.path);
        if (text === null) continue;
        const session = parseSessionMarkdown(text);
        if (!session) continue;
        sessions.push(session);
        pathsById.set(session.id, entry.path);
      }
      sessions.sort((a, b) => b.updatedAt - a.updatedAt);
      return { sessions, folders };
    },

    async saveSession(session, folders) {
      const path = `${prefix}${sessionFilePath(session, folders)}`;
      await store.write(path, sessionToMarkdown(session));
      const previous = pathsById.get(session.id);
      if (previous && previous !== path) await store.remove(previous);
      pathsById.set(session.id, path);
    },

    async removeSession(sessionId) {
      const path = pathsById.get(sessionId);
      if (!path) return;
      await store.remove(path);
      pathsById.delete(sessionId);
    },

    async saveFolders(folders) {
      await store.write(foldersPath, serializeFolders(folders));
    },

    async clearNamespace() {
      const entries = await store.list();
      for (const entry of entries) {
        if (!entry.path.startsWith(`${prefix}${CALCULATIONS_DIR}/`)) continue;
        await store.remove(entry.path);
      }
      pathsById.clear();
    },
  };
}
