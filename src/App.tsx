// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// Root component: theme, sidebar shell, top bar (session title, mode
// buttons, the disk-save icon), the calculator screen, and the modal
// siblings (settings, namespaces, PWA update toast, toasts).

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ToastViewport,
  defaultToastStore,
} from "@niclaslindstedt/oss-framework/components";
import { useMediaQuery } from "@niclaslindstedt/oss-framework/hooks";
import {
  NamespacesModal,
  applyFaviconHref,
  namespaceFaviconHref,
} from "@niclaslindstedt/oss-framework/namespaces";
import { UpdateToast, usePwaUpdate } from "@niclaslindstedt/oss-framework/pwa";
import {
  Sidebar,
  useEdgeSwipeOpen,
  usePersistentMenuPosition,
  useSidebarInset,
} from "@niclaslindstedt/oss-framework/sidebar";
import {
  useApplyTheme,
  type ThemeAppearance,
} from "@niclaslindstedt/oss-framework/theme";
import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";

import { CalculatorScreen } from "./app/CalculatorScreen.tsx";
import { APP_LOOK } from "./app/look.ts";
import { MODES, resolveMode } from "./app/modes.ts";
import { cacheIdForBase } from "./app/pwa.ts";
import { nextSessionTitle } from "./app/session.ts";
import { SettingsModal } from "./app/SettingsModal.tsx";
import { SideMenuContent } from "./app/SideMenuContent.tsx";
import { useAppSettings } from "./app/useAppSettings.ts";
import { useNamespaces } from "./app/useNamespaces.ts";
import { useSessions } from "./app/useSessions.ts";

const APPEARANCE_KEY = "calc:appearance";

function parseAppearance(raw: string): ThemeAppearance {
  try {
    // The value is written by AppearancePicker, so its shape is trusted;
    // merging over APP_LOOK fills anything an older build didn't store.
    return { ...APP_LOOK, ...(JSON.parse(raw) as Partial<ThemeAppearance>) };
  } catch {
    return APP_LOOK;
  }
}

// A floppy-disk save glyph — the one icon the framework set lacks.
function DiskIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className ?? "h-5 w-5"}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z" />
      <path d="M17 21v-8H7v8" />
      <path d="M7 3v5h8" />
    </svg>
  );
}

export function App() {
  // ---- theme (persisted like the sibling apps) --------------------------
  const [appearance, setAppearance] = useLocalStorageState<ThemeAppearance>(
    APPEARANCE_KEY,
    APP_LOOK,
    { parse: parseAppearance },
  );
  useApplyTheme(appearance);
  useEffect(() => {
    document.documentElement.setAttribute(
      "data-density",
      appearance.ui.density,
    );
  }, [appearance.ui.density]);

  // ---- app state --------------------------------------------------------
  const {
    settings,
    update,
    toggleMode,
    toggleKey,
    createCustomMode,
    deleteCustomMode,
  } = useAppSettings();
  const namespaces = useNamespaces();
  const sessions = useSessions(namespaces.activeSlug);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<"general" | "storage">(
    "general",
  );
  const [namespacesOpen, setNamespacesOpen] = useState(false);

  // ---- sidebar shell ----------------------------------------------------
  const pinned = useMediaQuery("(min-width: 768px)");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuPosition, setMenuPosition] =
    usePersistentMenuPosition("calc:menu-position");
  useSidebarInset(pinned, menuPosition.side);
  useEdgeSwipeOpen({
    side: menuPosition.side,
    enabled: !pinned && !drawerOpen,
    onOpen: () => setDrawerOpen(true),
  });

  // ---- PWA update -------------------------------------------------------
  const pwa = usePwaUpdate({
    base: import.meta.env.BASE_URL,
    cacheId: cacheIdForBase(import.meta.env.BASE_URL),
    enabled: !import.meta.env.DEV,
  });

  // ---- favicon follows the active namespace -----------------------------
  useEffect(() => {
    applyFaviconHref(
      namespaceFaviconHref(
        namespaces.active,
        `${import.meta.env.BASE_URL}icons/icon.svg`,
        { defaultColor: "#fbbf24" },
      ),
    );
  }, [namespaces.active]);

  // ---- mode resolution --------------------------------------------------
  const activeMode =
    resolveMode(sessions.active.mode, settings.customModes) ?? MODES.basic;
  const enabledModes = useMemo(
    () =>
      settings.enabledModes
        .map((id) => resolveMode(id, settings.customModes))
        .filter((m): m is NonNullable<typeof m> => m !== null),
    [settings.enabledModes, settings.customModes],
  );

  // ---- title editing ----------------------------------------------------
  const [titleDraft, setTitleDraft] = useState(sessions.active.title);
  const titleRef = useRef<HTMLInputElement>(null);
  const activeId = sessions.active.id;
  useEffect(() => {
    setTitleDraft(sessions.active.title);
    // A different session landed in the editor — drop any stale draft.
    // (Runs on id change only; typing keeps the draft.)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId]);

  const commitTitle = () => {
    if (titleDraft.trim() !== sessions.active.title) {
      sessions.retitleActive(titleDraft);
    }
  };

  // The disk icon: name-and-keep the current tape (notes-style — the title
  // field is focused and selected right after, ready to be renamed).
  const saveNow = () => {
    if (!sessions.connected) {
      setSettingsTab("storage");
      setSettingsOpen(true);
      return;
    }
    const title =
      titleDraft.trim() ||
      sessions.active.title.trim() ||
      nextSessionTitle(sessions.saved);
    sessions.saveActive(title);
    setTitleDraft(title);
    defaultToastStore.push({ message: `Saved “${title}”`, kind: "success" });
    window.setTimeout(() => {
      titleRef.current?.focus();
      titleRef.current?.select();
    }, 0);
  };

  const onCopied = (what: "value" | "expression") =>
    defaultToastStore.push({
      message: what === "value" ? "Value copied" : "Expression copied",
    });

  const storageLabel = sessions.connected
    ? sessions.backend === "folder"
      ? "Local folder"
      : sessions.backend === "dropbox"
        ? "Dropbox"
        : "Google Drive"
    : sessions.folderReconnectNeeded
      ? "Reconnect folder…"
      : "Connect storage…";

  return (
    <div className="flex h-[100svh] overflow-hidden bg-page-bg text-fg">
      <Sidebar
        pinned={pinned}
        open={drawerOpen}
        onToggle={() => setDrawerOpen((v) => !v)}
        onClose={() => setDrawerOpen(false)}
        position={menuPosition}
        onPositionChange={setMenuPosition}
        swipeToClose
        panelScroll={false}
        labels={{
          nav: "Sessions",
          open: "Open sidebar",
          close: "Close sidebar",
        }}
      >
        <SideMenuContent
          namespaces={namespaces.list}
          activeNamespace={namespaces.activeSlug}
          onSwitchNamespace={(slug) => {
            namespaces.switchTo(slug);
            setDrawerOpen(false);
          }}
          onManageNamespaces={() => setNamespacesOpen(true)}
          sessions={sessions.saved}
          folders={sessions.folders}
          activeSessionId={sessions.active.id}
          onOpenSession={(id) => {
            sessions.openSession(id);
            setHistoryOpen(true);
            setDrawerOpen(false);
          }}
          onNewSession={() => {
            sessions.newScratch();
            setHistoryOpen(false);
            setDrawerOpen(false);
          }}
          onDeleteSession={sessions.deleteSession}
          onRenameSession={(id, title) => {
            if (id === sessions.active.id) {
              sessions.retitleActive(title);
              setTitleDraft(title);
            } else {
              sessions.openSession(id);
              // Opening switches the active session; retitle on next tick so
              // the rename lands on the opened session's state.
              window.setTimeout(() => sessions.retitleActive(title), 0);
            }
          }}
          onMoveSession={sessions.moveSession}
          onCreateFolder={sessions.createFolder}
          onRenameFolder={sessions.renameFolder}
          onDeleteFolder={sessions.deleteFolder}
          onOpenSettings={() => {
            setSettingsTab("general");
            setSettingsOpen(true);
            setDrawerOpen(false);
          }}
          storageLabel={storageLabel}
          onOpenStorage={() => {
            if (sessions.folderReconnectNeeded) {
              void sessions.reconnectFolder();
              return;
            }
            setSettingsTab("storage");
            setSettingsOpen(true);
            setDrawerOpen(false);
          }}
        />
      </Sidebar>

      <main className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <input
            ref={titleRef}
            type="text"
            value={titleDraft}
            placeholder="Untitled session"
            aria-label="Session title"
            className="min-w-0 grow bg-transparent text-sm font-medium text-fg-bright outline-none placeholder:text-muted"
            onInput={(e) => setTitleDraft(e.currentTarget.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                commitTitle();
                e.currentTarget.blur();
              }
              if (e.key === "Escape") {
                setTitleDraft(sessions.active.title);
                e.currentTarget.blur();
              }
            }}
          />

          {/* Mode buttons */}
          <div
            className="flex shrink-0 gap-1"
            role="group"
            aria-label="Calculator mode"
          >
            {enabledModes.map((mode) => (
              <button
                key={mode.id}
                type="button"
                className={`rounded-lg px-2.5 py-1 font-mono text-xs ${
                  mode.id === activeMode.id
                    ? "bg-accent text-page-bg"
                    : "bg-surface-2 text-muted hover:text-fg"
                }`}
                title={mode.name}
                aria-pressed={mode.id === activeMode.id}
                onClick={() => sessions.setMode(mode.id)}
              >
                {mode.shortName}
              </button>
            ))}
          </div>

          <button
            type="button"
            className={`shrink-0 rounded-lg p-1.5 ${
              sessions.activeIsSaved && sessions.saveState !== "error"
                ? "text-muted"
                : "text-accent"
            } hover:bg-surface-2`}
            aria-label="Save session"
            title={
              sessions.saveState === "error"
                ? "Save failed — try again"
                : sessions.activeIsSaved
                  ? "Saved"
                  : "Save session"
            }
            onClick={saveNow}
          >
            <DiskIcon />
          </button>
        </header>

        <div className="min-h-0 grow">
          <CalculatorScreen
            session={sessions.active}
            mode={activeMode}
            hiddenKeys={settings.hiddenKeys[activeMode.id] ?? []}
            historyOpen={historyOpen}
            onHistoryOpenChange={setHistoryOpen}
            swipeDownHistory={settings.swipeDownHistory}
            keyFeedback={settings.keyFeedback}
            onLogEntry={sessions.logEntry}
            onNoteEntry={sessions.noteEntry}
            onDeleteEntry={sessions.deleteEntry}
            onCopied={onCopied}
          />
        </div>
      </main>

      <SettingsModal
        key={settingsTab + String(settingsOpen)}
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={update}
        onToggleMode={toggleMode}
        onToggleKey={toggleKey}
        onCreateCustomMode={createCustomMode}
        onDeleteCustomMode={deleteCustomMode}
        appearance={appearance}
        onAppearanceChange={setAppearance}
        backend={sessions.backend}
        connected={sessions.connected}
        onConnectFolder={() => void sessions.connectFolder()}
        onConnectDropbox={() => void sessions.connectDropbox()}
        onConnectGdrive={() => void sessions.connectGdrive()}
        onDisconnect={sessions.disconnect}
        initialTab={settingsTab}
      />

      <NamespacesModal
        open={namespacesOpen}
        onClose={() => setNamespacesOpen(false)}
        namespaces={namespaces.list}
        activeNamespace={namespaces.activeSlug}
        onSwitch={(slug) => {
          namespaces.switchTo(slug);
          setNamespacesOpen(false);
        }}
        onCreate={namespaces.create}
        onRename={namespaces.rename}
        onSetAppearance={namespaces.setAppearance}
        onRemove={namespaces.remove}
      />

      <UpdateToast
        needRefresh={pwa.needRefresh}
        incomingVersion={pwa.incomingVersion}
        onReload={() => void pwa.reload()}
        onDismiss={pwa.dismiss}
      />
      <ToastViewport store={defaultToastStore} />
    </div>
  );
}
