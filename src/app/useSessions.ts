// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The app's document state: the active (possibly scratch) session, the saved
// sessions and folders read from the storage backend, and the actions the UI
// dispatches. A scratch session is not a file — it becomes one the moment it
// is named, and from then on every change writes through: a calculation lands
// on the backend as soon as `=` is pressed, the slower edits (a note, a star,
// a deleted row) are debounced.
//
// Not a file is not the same as not kept: the scratch tape is mirrored onto
// the device as it changes (scratch.ts) and read back on the next visit, so a
// history nobody clears outlives the tab it was typed in — with or without a
// storage backend behind it.
//
// "Nothing connected" is itself a backend. With no folder or cloud chosen the
// session store is bound to the device's own `FileStore` (IndexedDB), so
// naming a tape makes it a file there and the sidebar lists it exactly as it
// would list a folder's. Connecting a backend afterwards moves those files
// into it — see `migrate` below — so the shelf follows the user rather than
// emptying behind them.

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
  deviceStore,
  DROPBOX_APP_KEY,
  dropboxFileStore,
  ensurePermission,
  FOLDER_BACKEND_AVAILABLE,
  folderFileStore,
  gdriveFileStore,
  GOOGLE_CLIENT_ID,
  loadDirectoryHandle,
  moveNamespace,
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
import { clearScratch, readScratch, writeScratch } from "./scratch.ts";
import { error as logError, status, warn } from "../output.ts";
import {
  appendEntry,
  clearEntries as clearSessionEntries,
  isDiscardable,
  isNamed,
  newId,
  newSession,
  removeEntry,
  setEntryNote,
  toggleEntryStar,
  type Folder,
  type Session,
} from "./session.ts";

const SAVE_DEBOUNCE_MS = 800;
// The longest the app waits for the working tape to reach the device before
// an update restart goes ahead without it.
const FLUSH_TIMEOUT_MS = 1500;

export type SaveState = "idle" | "saving" | "saved" | "error";

export type Sessions = ReturnType<typeof useSessions>;

export function useSessions(namespaceSlug: string) {
  const [backend, setBackend] = useState<BackendId | null>(null);
  const [connected, setConnected] = useState(false);
  const [folderReconnectNeeded, setFolderReconnectNeeded] = useState(false);
  // Bumped every time the underlying `FileStore` is swapped (connect,
  // reconnect, disconnect). `connected` alone can't carry that signal —
  // switching straight from one connected backend to another never changes it,
  // and the session store would keep writing to the old one.
  const [storeEpoch, setStoreEpoch] = useState(0);
  const storeRef = useRef<SessionStore | null>(null);
  const fileStoreRef = useRef<ReturnType<typeof folderFileStore> | null>(null);

  const [saved, setSaved] = useState<Session[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [active, setActive] = useState<Session>(() => newSession());
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [loadError, setLoadError] = useState<string | null>(null);

  const savedIds = useMemo(() => new Set(saved.map((s) => s.id)), [saved]);
  const activeIsSaved = savedIds.has(active.id);
  const activeIsNamed = isNamed(active);

  // ---- store (re)construction -------------------------------------------
  // No connected backend does not mean no store: the device's own `FileStore`
  // stands in, and everything above this seam — naming, listing, folders,
  // deleting — works the same whether it is IndexedDB or a folder underneath.
  const rebuildStore = useCallback(() => {
    const fs = fileStoreRef.current ?? deviceStore();
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
      setStoreEpoch((n) => n + 1);
      setConnected(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Rebuild the store and reload whenever the connection, the backend or the
  // namespace moves. `listedEpoch` catches up once that load has landed —
  // until then `saved` still describes the store we just left, which is why
  // the promotion below waits for it.
  const [listedEpoch, setListedEpoch] = useState(-1);
  useEffect(() => {
    rebuildStore();
    let cancelled = false;
    void refresh().then(() => {
      if (!cancelled) setListedEpoch(storeEpoch);
    });
    return () => {
      cancelled = true;
    };
  }, [connected, storeEpoch, rebuildStore, refresh]);

  // Switching namespace resets the working session (each namespace is its
  // own workspace); the tape left behind is not lost, it is the other
  // namespace's own scratch record and comes back with it.
  const nsRef = useRef(namespaceSlug);
  useEffect(() => {
    if (nsRef.current === namespaceSlug) return;
    nsRef.current = namespaceSlug;
    setActive(newSession());
  }, [namespaceSlug]);

  // ---- the scratch tape, kept on this device -----------------------------
  // A scratch session is nobody's file, so without this the tape would last
  // exactly as long as the tab: one reload and every calculation on it would
  // be gone, backend or no backend. It is mirrored into IndexedDB instead and
  // read back on the next visit, so a history the user never clears is never
  // taken from them either. A saved session needs no device copy — its file
  // in the storage backend is the durable one.

  // What the device said about this namespace's tape, and for which namespace
  // it said it. It holds the slug rather than a flag because a namespace
  // switch renders the new slug while the old namespace's tape is still the
  // active one: a boolean would be true for that one render and write the
  // outgoing tape into the incoming namespace's record. `usable` is false
  // when the device could not be read at all — the mirror below then does
  // nothing whatsoever, because a tape we failed to read is a tape that may
  // still be sitting there, and both halves of the mirror (the write and the
  // clear) would destroy it.
  const [scratchRead, setScratchRead] = useState<{
    slug: string;
    usable: boolean;
  } | null>(null);
  const scratchReady =
    scratchRead?.slug === namespaceSlug && scratchRead.usable;
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const restored = await readScratch(namespaceSlug);
      if (cancelled) return;
      // Onto an untouched tape only: a calculation made while the read was in
      // flight is the newer one, and the mirror below keeps it instead.
      if (restored.status === "tape") {
        const tape = restored.session;
        setActive((prev) => (isDiscardable(prev) ? tape : prev));
      }
      if (restored.status === "unavailable") {
        warn(
          "This device's working tape could not be read — it is left untouched",
        );
      }
      setScratchRead({
        slug: namespaceSlug,
        usable: restored.status !== "unavailable",
      });
    })();
    return () => {
      cancelled = true;
    };
  }, [namespaceSlug]);

  // Every change to an unsaved tape lands on the device as it happens — the
  // session only changes on a finished action (`=`, a committed note, a star,
  // a rename), so there is nothing here worth debouncing and nothing left
  // unwritten if the tab closes a moment later.
  useEffect(() => {
    if (!scratchReady) return;
    // An empty untitled tape leaves no record behind, and neither does one
    // that has become a file: clearing the history is meant to clear it.
    if (activeIsSaved || isDiscardable(active)) {
      void clearScratch(namespaceSlug);
      return;
    }
    void writeScratch(namespaceSlug, active);
  }, [active, activeIsSaved, namespaceSlug, scratchReady]);

  // Wait for the tape to be on the device, then let the caller go. The mirror
  // above already writes every change as it happens, but "as it happens" is a
  // transaction in flight, and the app update's restart button reloads the
  // page the moment it is pressed — a reload that lands mid-write is how a
  // tape goes missing on the one action the user was told is safe. IndexedDB
  // runs transactions in order, so a write queued now completes after the one
  // it may be racing. Capped, because nothing about an update may hang on a
  // database that has stopped answering.
  const flushScratch = useCallback(async () => {
    if (!scratchReady || activeIsSaved || isDiscardable(active)) return;
    await Promise.race([
      writeScratch(namespaceSlug, active),
      new Promise((resolve) => window.setTimeout(resolve, FLUSH_TIMEOUT_MS)),
    ]);
  }, [active, activeIsSaved, namespaceSlug, scratchReady]);

  // Pick a local folder and switch to it. The framework persists the handle to
  // IndexedDB so the grant survives reloads. A dismissed picker or a declined
  // permission prompt is a no-op — the same forgiving flow the contacts
  // sibling runs, so neither leaves a rejected promise behind the button.
  const connectFolder = useCallback(async () => {
    if (!FOLDER_BACKEND_AVAILABLE || !window.showDirectoryPicker) return;
    status("Opening the directory picker…");
    let handle: FileSystemDirectoryHandle;
    try {
      handle = await window.showDirectoryPicker({ mode: "readwrite" });
    } catch (err) {
      // AbortError = the user dismissed the picker; nothing to do.
      if (err instanceof DOMException && err.name === "AbortError") return;
      logError(
        `Folder picker failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    const granted = await ensurePermission(handle, true);
    if (granted !== "granted") {
      warn("Folder read-write permission was not granted");
      return;
    }
    await saveDirectoryHandle(handle);
    fileStoreRef.current = folderFileStore(handle);
    writeBackendPreference("folder");
    setBackend("folder");
    setFolderReconnectNeeded(false);
    setStoreEpoch((n) => n + 1);
    setConnected(true);
    status("Connected to a local folder");
  }, []);

  // Re-confirm a revoked OS grant on the already-stored handle.
  // `requestPermission` needs a user gesture, which is why this lives behind a
  // click handler. Falls back to a fresh pick when the stored record is gone.
  const reconnectFolder = useCallback(async () => {
    const handle = await loadDirectoryHandle();
    if (!handle) return connectFolder();
    const granted = await ensurePermission(handle, true);
    if (granted !== "granted") {
      warn("Folder reconnect declined");
      return;
    }
    fileStoreRef.current = folderFileStore(handle);
    writeBackendPreference("folder");
    setBackend("folder");
    setFolderReconnectNeeded(false);
    setStoreEpoch((n) => n + 1);
    setConnected(true);
    status("Reconnected to the local folder");
  }, [connectFolder]);

  // Dropbox authorises by redirect: this call navigates away, and the boot
  // effect above finishes the PKCE exchange when the browser comes back.
  const connectDropbox = useCallback(async () => {
    if (!DROPBOX_APP_KEY) return;
    status("Starting Dropbox authorization…");
    await startDropboxAuth(DROPBOX_APP_KEY);
  }, []);

  const connectGdrive = useCallback(async () => {
    if (!GOOGLE_CLIENT_ID) return;
    status("Requesting Google Drive consent…");
    let token: string;
    try {
      token = await startGdriveAuth(GOOGLE_CLIENT_ID);
    } catch (err) {
      // A dismissed consent popup lands here — nothing to connect.
      logError(
        `Google Drive consent failed: ${err instanceof Error ? err.message : String(err)}`,
      );
      return;
    }
    writeGdriveToken(token);
    fileStoreRef.current = gdriveFileStore(token);
    writeBackendPreference("gdrive");
    setBackend("gdrive");
    setStoreEpoch((n) => n + 1);
    setConnected(true);
    status("Connected to Google Drive");
  }, []);

  const disconnect = useCallback(() => {
    status("Storage backend disconnected — tapes stay on this device");
    clearBackendState();
    fileStoreRef.current = null;
    storeRef.current = null;
    setBackend(null);
    setStoreEpoch((n) => n + 1);
    setConnected(false);
    setFolderReconnectNeeded(false);
    setSaved([]);
    setFolders([]);
  }, []);

  // ---- persistence -------------------------------------------------------
  // Every backend write goes through one queue rather than being fired off in
  // parallel: two calculations a few hundred milliseconds apart must land in
  // the order they were made (or the older tape wins), and a delete must not
  // overtake a save that would put the file straight back. `pendingWrites`
  // counts what is still in flight, so the status only reads "saved" once the
  // last write has landed.
  const writeQueue = useRef<Promise<void>>(Promise.resolve());
  const pendingWrites = useRef(0);
  // A debounced write and the session it is holding, so deleting that session
  // can drop it instead of letting it recreate the file it just removed.
  const persistTimer = useRef<{ handle: number; sessionId: string } | null>(
    null,
  );

  const enqueueWrite = useCallback(
    (op: (store: SessionStore) => Promise<void>) => {
      const store = storeRef.current;
      if (!store) return;
      pendingWrites.current += 1;
      setSaveState("saving");
      writeQueue.current = writeQueue.current
        .then(() => op(store))
        .then(() => {
          pendingWrites.current -= 1;
          if (pendingWrites.current === 0) setSaveState("saved");
        })
        .catch((err: unknown) => {
          pendingWrites.current -= 1;
          logError(
            `Saving failed: ${err instanceof Error ? err.message : String(err)}`,
          );
          setSaveState("error");
        });
    },
    [],
  );

  const cancelPendingWrite = useCallback((sessionId?: string) => {
    const pending = persistTimer.current;
    if (!pending) return;
    if (sessionId !== undefined && pending.sessionId !== sessionId) return;
    window.clearTimeout(pending.handle);
    persistTimer.current = null;
  }, []);

  const persistNow = useCallback(
    (session: Session, currentFolders: readonly Folder[]) =>
      enqueueWrite((store) => store.saveSession(session, currentFolders)),
    [enqueueWrite],
  );

  // Write a named session through. A calculation asks for `immediate`: `=` is
  // the moment the tape gained something worth keeping, so it goes to the
  // backend right away. The slower edits (typing a note, starring a row)
  // debounce, and a pending debounce is always superseded by whatever comes
  // next — the session is written whole, so the newer copy contains the older.
  const persistSession = useCallback(
    (
      session: Session,
      currentFolders: readonly Folder[],
      immediate = false,
    ) => {
      if (!storeRef.current) return;
      cancelPendingWrite();
      if (immediate) {
        persistNow(session, currentFolders);
        return;
      }
      persistTimer.current = {
        sessionId: session.id,
        handle: window.setTimeout(() => {
          persistTimer.current = null;
          persistNow(session, currentFolders);
        }, SAVE_DEBOUNCE_MS),
      };
    },
    [cancelPendingWrite, persistNow],
  );

  // Update the active session. A named session is a file: the change is
  // mirrored into the saved list (adding it there the first time — naming is
  // what saves a tape) and written through. An unnamed tape, or a named one
  // with no backend to write to, stays scratch and rides the device mirror
  // above instead.
  const updateActive = useCallback(
    (fn: (session: Session) => Session, { immediate = false } = {}) => {
      setActive((prev) => {
        const next = fn(prev);
        if (next === prev) return prev;
        if (!storeRef.current) return next;
        if (!isNamed(next) && !savedIds.has(next.id)) return next;
        setSaved((list) =>
          list.some((s) => s.id === next.id)
            ? list.map((s) => (s.id === next.id ? next : s))
            : [next, ...list],
        );
        persistSession(next, folders, immediate);
        return next;
      });
    },
    [savedIds, folders, persistSession],
  );

  // ---- moving the device's sessions into a connected backend -------------
  // Sessions named while nothing was connected are files, they simply live on
  // the device. The first backend the user connects takes them: each is
  // written through and the device's copies dropped, so connecting storage
  // moves the shelf rather than emptying it. A session the backend already
  // holds under the same id is left where it is — that copy is the one the
  // user's other devices agree on — and the device's is dropped with the rest.
  //
  // It rides the write queue rather than running beside it: the device write
  // for a session named a moment ago may still be in flight, and the move has
  // to see it. Once per store swap per namespace, which is what `migratedFor`
  // remembers.
  const migratedFor = useRef("");
  useEffect(() => {
    const store = storeRef.current;
    if (!connected || !store) return;
    // Only once the backend's own listing is in: moving against a stale
    // `saved` would write a session the fresh listing then contradicts.
    if (listedEpoch !== storeEpoch) return;
    const key = `${storeEpoch}:${namespaceSlug}`;
    if (migratedFor.current === key) return;
    migratedFor.current = key;
    const device = createSessionStore(deviceStore(), namespaceSlug);
    writeQueue.current = writeQueue.current
      .then(async () => {
        const result = await moveNamespace(device, store, () =>
          setSaveState("saving"),
        );
        if (!result) return;
        setFolders(result.folders);
        setSaved((list) => {
          const byId = new Map(list.map((s) => [s.id, s]));
          for (const session of result.moved) byId.set(session.id, session);
          return [...byId.values()].sort((a, b) => b.updatedAt - a.updatedAt);
        });
        setSaveState("saved");
        status(`Moved ${result.moved.length} session(s) off this device`);
      })
      .catch((err: unknown) => {
        logError(
          `Moving this device's sessions failed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
        setSaveState("error");
      });
  }, [connected, storeEpoch, listedEpoch, namespaceSlug]);

  // ---- session actions ---------------------------------------------------
  // `=`. On a named session this is a save: the calculation is written to the
  // backend as it is made, not eight hundred milliseconds later.
  const logEntry = useCallback(
    (expression: string, result: string, chained: boolean) =>
      updateActive((s) => appendEntry(s, expression, result, { chained }), {
        immediate: true,
      }),
    [updateActive],
  );

  const noteEntry = useCallback(
    (entryId: string, note: string) =>
      updateActive((s) => setEntryNote(s, entryId, note)),
    [updateActive],
  );

  const starEntry = useCallback(
    (entryId: string) => updateActive((s) => toggleEntryStar(s, entryId)),
    [updateActive],
  );

  const deleteEntry = useCallback(
    (entryId: string) => updateActive((s) => removeEntry(s, entryId)),
    [updateActive],
  );

  // Wipe the tape but keep the session — a saved one writes the empty tape
  // through like any other edit.
  const clearEntries = useCallback(
    () => updateActive((s) => clearSessionEntries(s)),
    [updateActive],
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

  // The top-bar title edit — and the app's only save gesture. Naming a scratch
  // tape turns it into a file there and then; renaming a saved one writes the
  // rename through (the store reconciles the renamed file, deleting the stale
  // path). Clearing the name of a session that is already a file does not
  // delete it: the file stays, under the fallback `session-<id6>.md` stem.
  const retitleActive = useCallback(
    (title: string) =>
      updateActive(
        (s) =>
          s.title === title.trim()
            ? s
            : { ...s, title: title.trim(), updatedAt: Date.now() },
        { immediate: true },
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

  const deleteSession = useCallback(
    (id: string) => {
      setSaved((list) => list.filter((s) => s.id !== id));
      // A debounced write still holding this session would put the file back.
      cancelPendingWrite(id);
      enqueueWrite((store) => store.removeSession(id));
      setActive((prev) => (prev.id === id ? newSession() : prev));
    },
    [cancelPendingWrite, enqueueWrite],
  );

  const moveSession = useCallback(
    (id: string, folderId: string | undefined) => {
      setSaved((list) =>
        list.map((s) => {
          if (s.id !== id) return s;
          const next = { ...s, folderId, updatedAt: Date.now() };
          persistNow(next, folders);
          return next;
        }),
      );
      setActive((prev) => (prev.id === id ? { ...prev, folderId } : prev));
    },
    [folders, persistNow],
  );

  // ---- folder actions ----------------------------------------------------
  const persistFolders = useCallback(
    (next: Folder[]) => enqueueWrite((store) => store.saveFolders(next)),
    [enqueueWrite],
  );

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
    activeIsNamed,
    saveState,
    loadError,
    refresh,
    logEntry,
    noteEntry,
    starEntry,
    deleteEntry,
    clearEntries,
    retitleActive,
    setMode,
    openSession,
    newScratch,
    flushScratch,
    deleteSession,
    moveSession,
    createFolder,
    renameFolder,
    deleteFolder,
  };
}
