// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// Root component: theme, sidebar shell, top bar (session title, mode
// buttons, the disk-save icon), the calculator screen, and the modal
// siblings (settings, namespaces, PWA update toast, toasts).

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ConfirmDialog,
  ToastViewport,
  defaultToastStore,
} from "@niclaslindstedt/oss-framework/components";
import {
  useDesktopPointer,
  useLocalStorageState,
  useMediaQuery,
} from "@niclaslindstedt/oss-framework/hooks";
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

import { CalculatorScreen } from "./app/CalculatorScreen.tsx";
import { APP_LOOK } from "./app/look.ts";
import { MODES, resolveMode } from "./app/modes.ts";
import { cacheIdForBase } from "./app/pwa.ts";
import { nextSessionTitle } from "./app/session.ts";
import { SettingsModal, type SettingsTab } from "./app/SettingsModal.tsx";
import {
  SIDEBAR_PANEL_WIDTH,
  SIDEBAR_RAIL_WIDTH,
  SidebarCollapseRail,
} from "./app/SidebarRails.tsx";
import { SideMenuContent } from "./app/SideMenuContent.tsx";
import { useAppSettings } from "./app/useAppSettings.ts";
import { useEdgeHover } from "./app/useEdgeHover.ts";
import { useNamespaces } from "./app/useNamespaces.ts";
import { useSessions } from "./app/useSessions.ts";

const APPEARANCE_KEY = "calc:appearance";
// Folding the docked sidebar away is a per-device layout choice — a wide
// desktop and a small laptop want different answers — so it rides localStorage
// beside the menu-button position rather than the synced appearance store.
const SIDEBAR_COLLAPSED_KEY = "calc:sidebar-collapsed";

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
  const { settings, commit: commitSettings } = useAppSettings();
  const namespaces = useNamespaces();
  const sessions = useSessions(namespaces.activeSlug);

  const [historyOpen, setHistoryOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("general");
  const [namespacesOpen, setNamespacesOpen] = useState(false);
  // Long-pressing `C` on an empty display asks to wipe the tape. It is the
  // one keypad gesture with nothing to undo it, so it asks first.
  const [clearHistoryOpen, setClearHistoryOpen] = useState(false);

  // ---- sidebar shell ----------------------------------------------------
  const pinned = useMediaQuery("(min-width: 768px)");
  const [drawerOpen, setDrawerOpen] = useState(false);
  // The floating menu button rests over the display, not the keypad — the
  // framework's default (`y: 0.5`) puts it on top of the top-left key. It
  // stays draggable from there.
  const [menuPosition, setMenuPosition] = usePersistentMenuPosition(
    "calc:menu-position",
    { side: "left", y: 0.2 },
  );
  // Whether the docked sidebar is folded away, handing every one of its pixels
  // to the calculator — all that is left is a collapse rail that stays
  // invisible until the pointer reaches that edge of the screen. Only
  // meaningful while `pinned`: the phone drawer closes instead of collapsing.
  const [sidebarCollapsed, setSidebarCollapsed] = useLocalStorageState<boolean>(
    SIDEBAR_COLLAPSED_KEY,
    false,
  );
  const sidebarDocked = pinned && !sidebarCollapsed;
  // A collapsed sidebar occupies nothing, so the overlays that inset past it
  // (the toasts) must stop reserving its width.
  useSidebarInset(sidebarDocked, menuPosition.side);
  // The collapse rail gives its pixels back to the app and only materialises
  // when the pointer comes to that edge looking for it. A click-through
  // element can never match `:hover`, so the cursor is tracked against the
  // rail's own box instead. A device that can't hover would never see it at
  // all — and, once collapsed, would have no way back — so there it stays up.
  const railRef = useRef<HTMLButtonElement>(null);
  const hoverCapable = useDesktopPointer();
  const railHovered = useEdgeHover(railRef, hoverCapable);
  const railRevealed = !hoverCapable || railHovered;
  // The rail's band. Collapsed it hugs the viewport edge, where a cursor
  // thrown at the side of the screen lands on it without aiming. Docked it
  // straddles the panel's inner edge (half the rail's width back from
  // `SIDEBAR_PANEL_WIDTH`), so it reads as a grip on the divider.
  const railOffset = sidebarCollapsed
    ? "0px"
    : `calc(${SIDEBAR_PANEL_WIDTH} - ${SIDEBAR_RAIL_WIDTH} / 2)`;
  // "Open sidebar with" (Settings → General): on phones the drawer opens
  // either from the floating button or from an inward edge swipe — one or the
  // other, never both, so the gesture and the button can't fight each other.
  // A docked (pinned) sidebar has neither.
  const swipeToOpen = !pinned && settings.menuMode === "swipe";
  useEdgeSwipeOpen({
    side: menuPosition.side,
    enabled: swipeToOpen && !drawerOpen,
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

  const entryCount = sessions.active.entries.length;

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

  return (
    <div className="relative flex h-[var(--app-height,100svh)] overflow-hidden bg-page-bg text-fg">
      {/* The docked sidebar folds away entirely (the choice persists), so a
          collapsed one renders no panel at all — its rail floats over the
          calculator rather than displacing it. On a phone there is nothing to
          collapse: the drawer closes instead. */}
      {!(pinned && sidebarCollapsed) && (
        <Sidebar
          pinned={pinned}
          open={drawerOpen}
          onToggle={() => setDrawerOpen((v) => !v)}
          onClose={() => setDrawerOpen(false)}
          position={menuPosition}
          onPositionChange={setMenuPosition}
          showButton={!pinned && !swipeToOpen}
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
          />
        </Sidebar>
      )}
      {pinned && (
        <SidebarCollapseRail
          collapsed={sidebarCollapsed}
          side={menuPosition.side}
          label={sidebarCollapsed ? "Show sidebar" : "Hide sidebar"}
          offset={railOffset}
          revealed={railRevealed}
          elementRef={railRef}
          onClick={() => setSidebarCollapsed((v) => !v)}
        />
      )}

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
            keyTextSize={settings.keyTextSize}
            displayTextSize={settings.displayTextSize}
            onLogEntry={sessions.logEntry}
            onNoteEntry={sessions.noteEntry}
            onStarEntry={sessions.starEntry}
            onDeleteEntry={sessions.deleteEntry}
            onClearHistory={() => {
              if (entryCount > 0) setClearHistoryOpen(true);
            }}
          />
        </div>
      </main>

      <ConfirmDialog
        open={clearHistoryOpen}
        title="Clear history?"
        description={`This removes ${entryCount} ${
          entryCount === 1 ? "entry" : "entries"
        } from this session's tape, notes and stars included. It cannot be undone.`}
        confirmLabel="Clear history"
        tone="danger"
        onConfirm={() => {
          sessions.clearEntries();
          setClearHistoryOpen(false);
          defaultToastStore.push({
            message: "History cleared",
            kind: "success",
          });
        }}
        onCancel={() => setClearHistoryOpen(false)}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onCommit={commitSettings}
        appearance={appearance}
        onAppearanceChange={setAppearance}
        backend={sessions.backend}
        connected={sessions.connected}
        folderReconnectNeeded={sessions.folderReconnectNeeded}
        onConnectFolder={sessions.connectFolder}
        onConnectDropbox={sessions.connectDropbox}
        onConnectGdrive={sessions.connectGdrive}
        onReconnectFolder={sessions.reconnectFolder}
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
