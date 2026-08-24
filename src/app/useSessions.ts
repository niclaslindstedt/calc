// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The app's document state: the active (possibly scratch) session, the saved
// sessions and folders read from the storage backend, and the actions the UI
// dispatches. A scratch session lives only in memory — it becomes a file the
// moment the user saves it with the disk icon; saved sessions write through
// (debounced) on every change.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  completeDropboxAuth,
  hasPendingDropboxAuth,
  startDropboxAuth,
  startGdriveAuth,
} from "@niclaslindstedt/oss-framework/storage";

import {
  clearBackendState,
  createSessionStore,
  DROPBOX_APP_KEY,
  dropboxFileStore,
  ensurePermission,
  folderFileStore,
  gdriveFileStore,
  GOOGLE_CLIENT_ID,
  loadDirectoryHandle,
  readBackendPreference,
  readDropboxTokens,
  readGdriveToken,
  saveDirectoryHandle,
  writeBackendPreference,
  writeDropboxTokens,
  writeGdriveToken,
  type BackendId,
  type SessionStore,
} from "./store.ts";
import { error as logError, status } from "../output.ts";
import {
  appendEntry,
  isDiscardable,
  newId,
  newSession,
  removeEntry,
  setEntryNote,
  type Folder,
  type Session,
} from "./session.ts";

const SAVE_DEBOUNCE_MS = 800;

export type SaveState = "idle" | "saving" | "saved" | "error";

export type Sessions = ReturnType<typeof useSessions>;

export function useSessions(namespaceSlug: string) {
  const [backend, setBackend] = useState<BackendId | null>(null);
  const [connected, setConnected] = useState(false);
  const [folderReconnectNeeded, setFolderReconnectNeeded] = useState(false);
  const storeRef = useRef<SessionStore | null>(null);
  const fileStoreRef = useRef<ReturnType<typeof folderFileStore> | null>(null);

  const [saved, setSaved] = useState<Session[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [active, setActive] = useState<Session>(() => newSession());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const savedIds = useMemo(() => new Set(saved.map((s) => s.id)), [saved]);
  const activeIsSaved = savedIds.has(active.id);

  // ---- store (re)construction -------------------------------------------
  const rebuildStore = useCallback(() => {
    const fs = fileStoreRef.current;
    if (!fs) {
      storeRef.current = null;
      return;
    }
    storeRef.current = createSessionStore(fs, namespaceSlug);
  }, [namespaceSlug]);

  const refresh = useCallback(async () => {
    const store = storeRef.current;
    if (!store) {
      setSaved([]);
      setFolders([]);
      return;
    }
    try {
      const { sessions, folders: loadedFolders } = await store.list();
      status(`Loaded ${sessions.length} session(s)`);
      setSaved(sessions);
      setFolders(loadedFolders);
      setLoadError(null);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logError(`Loading sessions failed: ${message}`);
      setLoadError(message);
    }
  }, []);

  // ---- backend boot / connect -------------------------------------------
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Finish a Dropbox PKCE redirect if one is pending.
      if (DROPBOX_APP_KEY && hasPendingDropboxAuth()) {
        try {
          const params = new URLSearchParams(window.location.search);
          const code = params.get("code");
          if (code) {
            const result = await completeDropboxAuth(DROPBOX_APP_KEY, code);
            writeDropboxTokens(result.accessToken, result.refreshToken);
            writeBackendPreference("dropbox");
            window.history.replaceState(null, "", window.location.pathname);
          }
        } catch {
          // A failed redirect just leaves the backend disconnected.
        }
      }
      const preference = readBackendPreference();
      if (!preference || cancelled) return;
      if (preference === "folder") {
        const handle = await loadDirectoryHandle();
        if (!handle || cancelled) {
          setBackend("folder");
          setFolderReconnectNeeded(true);
          return;
        }
        const granted = await ensurePermission(handle, false);
        if (cancelled) return;
        if (granted !== "granted") {
          setBackend("folder");
          setFolderReconnectNeeded(true);
          return;
        }
        fileStoreRef.current = folderFileStore(handle);
      } else if (preference === "dropbox") {
        const tokens = readDropboxTokens();
        if (!tokens || cancelled) return;
        fileStoreRef.current = dropboxFileStore(tokens);
      } else {
        const token = readGdriveToken();
        if (!token || cancelled) return;
        fileStoreRef.current = gdriveFileStore(token);
      }
      setBackend(preference);
      setConnected(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rebuild the store and reload whenever the connection or namespace moves.
  useEffect(() => {
    rebuildStore();
    void refresh();
  }, [connected, rebuildStore, refresh]);

  // Switching namespace resets the working session (each namespace is its
  // own workspace); a scratch tape with content is intentionally dropped —
  // it was never saved.
  const nsRef = useRef(namespaceSlug);
  useEffect(() => {
    if (nsRef.current === namespaceSlug) return;
    nsRef.current = namespaceSlug;
    setActive(newSession());
  }, [namespaceSlug]);

  const connectFolder = useCallback(async () => {
    if (!window.showDirectoryPicker) return;
    const handle = await window.showDirectoryPicker({ mode: "readwrite" });
    await saveDirectoryHandle(handle);
    fileStoreRef.current = folderFileStore(handle);
    writeBackendPreference("folder");
    setBackend("folder");
    setFolderReconnectNeeded(false);
    setConnected(true);
  }, []);

  const reconnectFolder = useCallback(async () => {
    const handle = await loadDirectoryHandle();
    if (!handle) return connectFolder();
    const granted = await ensurePermission(handle, true);
    if (granted !== "granted") return;
    fileStoreRef.current = folderFileStore(handle);
    setFolderReconnectNeeded(false);
    setConnected(true);
  }, [connectFolder]);

  const connectDropbox = useCallback(async () => {
    if (!DROPBOX_APP_KEY) return;
    await startDropboxAuth(DROPBOX_APP_KEY);
  }, []);

  const connectGdrive = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) return;
    const token = await startGdriveAuth(GOOGLE_CLIENT_ID);
    writeGdriveToken(token);
    fileStoreRef.current = gdriveFileStore(token);
    writeBackendPreference("gdrive");
    setBackend("gdrive");
    setConnected(true);
  }, []);

  const disconnect = useCallback(() => {
    clearBackendState();
    fileStoreRef.current = null;
    storeRef.current = null;
    setBackend(null);
    setConnected(false);
    setFolderReconnectNeeded(false);
    setSaved([]);
    setFolders([]);
  }, []);

  // ---- persistence -------------------------------------------------------
  const persistTimer = useRef<number | null>(null);
  const persistSession = useCallback(
    (session: Session, currentFolders: readonly Folder[]) => {
      const store = storeRef.current;
      if (!store) return;
      if (persistTimer.current !== null) {
        window.clearTimeout(persistTimer.current);
      }
      persistTimer.current = window.setTimeout(() => {
        persistTimer.current = null;
        setSaveState("saving");
        store
          .saveSession(session, currentFolders)
          .then(() => setSaveState("saved"))
          .catch((err: unknown) => {
            logError(
              `Saving failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            setSaveState("error");
          });
      }, SAVE_DEBOUNCE_MS);
    },
    [],
  );

  // Update the active session; when it's a saved one, mirror the change into
  // the saved list and schedule the write-through.
  const updateActive = useCallback(
    (fn: (session: Session) => Session) => {
      setActive((prev) => {
        const next = fn(prev);
        if (savedIds.has(next.id)) {
          setSaved((list) => list.map((s) => (s.id === next.id ? next : s)));
          persistSession(next, folders);
        }
        return next;
      });
    },
    [savedIds, folders, persistSession],
  );

  // ---- session actions ---------------------------------------------------
  const logEntry = useCallback(
    (expression: string, result: string) =>
      updateActive((s) => appendEntry(s, expression, result)),
    [updateActive],
  );

  const noteEntry = useCallback(
    (entryId: string, note: string) =>
      updateActive((s) => setEntryNote(s, entryId, note)),
    [updateActive],
  );

  const deleteEntry = useCallback(
    (entryId: string) => updateActive((s) => removeEntry(s, entryId)),
    [updateActive],
  );

  // The disk icon: persist the scratch session under a title (and optional
  // folder). On a saved session this renames it.
  const saveActive = useCallback(
    (title: string, folderId?: string) => {
      const session: Session = {
        ...active,
        title: title.trim(),
        folderId: folderId ?? active.folderId,
        updatedAt: Date.now(),
      };
      setActive(session);
      setSaved((list) =>
        savedIds.has(session.id)
          ? list.map((s) => (s.id === session.id ? session : s))
          : [session, ...list],
      );
      const store = storeRef.current;
      if (store) {
        setSaveState("saving");
        store
          .saveSession(session, folders)
          .then(() => setSaveState("saved"))
          .catch((err: unknown) => {
            logError(
              `Saving failed: ${err instanceof Error ? err.message : String(err)}`,
            );
            setSaveState("error");
          });
      }
    },
    [active, savedIds, folders],
  );

  // Open a saved session; a discardable scratch tape is silently dropped.
  const openSession = useCallback(
    (id: string) => {
      const session = saved.find((s) => s.id === id);
      if (session) setActive(session);
    },
    [saved],
  );

  const newScratch = useCallback(() => {
    // A fresh tape keeps the mode you're in.
    setActive((prev) =>
      isDiscardable(prev) ? prev : newSession(Date.now(), prev.mode),
    );
  }, []);

  // The top-bar title edit: a scratch session just holds the title in
  // memory; a saved session writes the rename through (updateActive handles
  // both, and the store reconciles the renamed file on the next save).
  const retitleActive = useCallback(
    (title: string) =>
      updateActive((s) =>
        s.title === title.trim()
          ? s
          : { ...s, title: title.trim(), updatedAt: Date.now() },
      ),
    [updateActive],
  );

  // The top-bar mode switch: the active session remembers its mode, so this
  // writes through on a saved session.
  const setMode = useCallback(
    (mode: string) =>
      updateActive((s) =>
        s.mode === mode ? s : { ...s, mode, updatedAt: Date.now() },
      ),
    [updateActive],
  );

  const deleteSession = useCallback((id: string) => {
    setSaved((list) => list.filter((s) => s.id !== id));
    const store = storeRef.current;
    if (store)
      void store.removeSession(id).catch((err: unknown) => {
        logError(
          `Saving failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        setSaveState("error");
      });
    setActive((prev) => (prev.id === id ? newSession() : prev));
  }, []);

  const moveSession = useCallback(
    (id: string, folderId: string | undefined) => {
      const store = storeRef.current;
      setSaved((list) =>
        list.map((s) => {
          if (s.id !== id) return s;
          const next = { ...s, folderId, updatedAt: Date.now() };
          if (store)
            void store.saveSession(next, folders).catch((err: unknown) => {
              logError(
                `Saving failed: ${err instanceof Error ? err.message : String(err)}`,
              );
              setSaveState("error");
            });
          return next;
        }),
      );
      setActive((prev) => (prev.id === id ? { ...prev, folderId } : prev));
    },
    [folders],
  );

  // ---- folder actions ----------------------------------------------------
  const persistFolders = useCallback((next: Folder[]) => {
    const store = storeRef.current;
    if (store)
      void store.saveFolders(next).catch((err: unknown) => {
        logError(
          `Saving failed: ${err instanceof Error ? err.message : String(err)}`,
        );
        setSaveState("error");
      });
  }, []);

  const createFolder = useCallback(
    (name: string) => {
      const folder: Folder = { id: `f-${newId().slice(0, 8)}`, name };
      setFolders((prev) => {
        const next = [...prev, folder];
        persistFolders(next);
        return next;
      });
      return folder;
    },
    [persistFolders],
  );

  const renameFolder = useCallback(
    (id: string, name: string) => {
      setFolders((prev) => {
        const next = prev.map((f) => (f.id === id ? { ...f, name } : f));
        persistFolders(next);
        return next;
      });
    },
    [persistFolders],
  );

  // Deleting a folder keeps its sessions — they fall back to the top level
  // (same forgiving rule as the sibling apps).
  const deleteFolder = useCallback(
    (id: string) => {
      setFolders((prev) => {
        const next = prev.filter((f) => f.id !== id);
        persistFolders(next);
        return next;
      });
      setSaved((list) =>
        list.map((s) =>
          s.folderId === id ? { ...s, folderId: undefined } : s,
        ),
      );
      setActive((prev) =>
        prev.folderId === id ? { ...prev, folderId: undefined } : prev,
      );
    },
    [persistFolders],
  );

  return {
    backend,
    connected,
    folderReconnectNeeded,
    connectFolder,
    reconnectFolder,
    connectDropbox,
    connectGdrive,
    disconnect,
    saved,
    folders,
    active,
    activeIsSaved,
    saveState,
    loadError,
    refresh,
    logEntry,
    noteEntry,
    deleteEntry,
    retitleActive,
    setMode,
    saveActive,
    openSession,
    newScratch,
    deleteSession,
    moveSession,
    createFolder,
    renameFolder,
    deleteFolder,
  };
}
