// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The Settings dialog, built on the same shell as the sibling contacts app: a
// vertical tab rail owns section selection on desktop, and below `sm:` the
// rail collapses into a header burger that opens the same sections as a
// `FloatingPanel` menu. A Reset / Cancel / Save footer lives in the `Modal`'s
// footer slot.
//
// Sections: General (the calculator's gesture toggles), Layouts (enable /
// disable modes, customize a mode's buttons by pressing them, create new
// modes from a base layout), Appearance (the framework theme picker) and
// Storage (the backend connection — the only way into it, so the sidebar
// footer stays about sessions).
//
// Editing model, borrowed wholesale from contacts: appearance edits preview
// live and revert on Cancel; every settings knob (including the Layouts tab's
// mode list and button editors) is staged in a draft and only committed on
// Save. The Storage tab is the exception — connecting or disconnecting a
// backend is device state that applies the moment it is pressed, not a
// setting to be saved.

import {
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
} from "react";

import {
  Button,
  CloseIcon,
  CogIcon,
  DatabaseIcon,
  FloatingPanel,
  GripIcon,
  MenuIcon,
  Modal,
  PaletteIcon,
  Section,
  SlidersIcon,
  ToggleRow,
  TrashIcon,
  type FloatingPlacement,
  type IconProps,
} from "@niclaslindstedt/oss-framework/components";
import {
  AppearancePicker,
  type ThemeAppearance,
} from "@niclaslindstedt/oss-framework/theme";

import { Keypad } from "./Keypad.tsx";
import { APP_LOOK } from "./look.ts";
import {
  BUILTIN_MODE_IDS,
  MODES,
  resolveMode,
  type BuiltinModeId,
  type CustomMode,
  type ModeId,
} from "./modes.ts";
import { DEFAULT_SETTINGS, type AppSettings } from "./useAppSettings.ts";
import type { BackendId } from "./store.ts";
import {
  DROPBOX_APP_KEY,
  FOLDER_BACKEND_AVAILABLE,
  GOOGLE_CLIENT_ID,
} from "./store.ts";

export type SettingsTab = "general" | "layouts" | "appearance" | "storage";

type TabDef = {
  id: SettingsTab;
  label: string;
  icon: (p: IconProps) => ReactNode;
};

const TABS: TabDef[] = [
  { id: "general", label: "General", icon: SlidersIcon },
  { id: "layouts", label: "Layouts", icon: GripIcon },
  { id: "appearance", label: "Appearance", icon: PaletteIcon },
  { id: "storage", label: "Storage", icon: DatabaseIcon },
];

// The mobile section menu hangs off the header burger.
const MENU_PLACEMENT: FloatingPlacement = {
  width: { kind: "min", minPx: 192 },
  anchor: "left",
  coordinateSpace: "viewport",
};

const BACKEND_NAMES: Record<BackendId, string> = {
  folder: "Local folder",
  dropbox: "Dropbox",
  gdrive: "Google Drive",
};

type Props = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  // Commits the whole settings object at once — Save hands over the draft.
  onCommit: (next: AppSettings) => void;
  appearance: ThemeAppearance;
  onAppearanceChange: (next: ThemeAppearance) => void;
  backend: BackendId | null;
  connected: boolean;
  folderReconnectNeeded: boolean;
  onConnectFolder: () => void;
  onConnectDropbox: () => void;
  onConnectGdrive: () => void;
  onReconnectFolder: () => void;
  onDisconnect: () => void;
  initialTab?: SettingsTab;
};

export function SettingsModal({
  open,
  onClose,
  settings,
  onCommit,
  appearance,
  onAppearanceChange,
  backend,
  connected,
  folderReconnectNeeded,
  onConnectFolder,
  onConnectDropbox,
  onConnectGdrive,
  onReconnectFolder,
  onDisconnect,
  initialTab = "general",
}: Props) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [menuOpen, setMenuOpen] = useState(false);
  const [draft, setDraft] = useState<AppSettings>(settings);
  const menuRef = useRef<HTMLButtonElement>(null);
  // The appearance to restore if the user cancels — captured on open.
  const snapshot = useRef<ThemeAppearance>(appearance);

  // The mode currently opened in the press-to-toggle button editor.
  const [editingMode, setEditingMode] = useState<ModeId | null>(null);
  // The "new mode" draft: base layout, pressed-away keys, name.
  const [draftBase, setDraftBase] = useState<BuiltinModeId | null>(null);
  const [draftHidden, setDraftHidden] = useState<string[]>([]);
  const [draftName, setDraftName] = useState("");

  const closeEditors = () => {
    setEditingMode(null);
    setDraftBase(null);
    setDraftHidden([]);
    setDraftName("");
  };

  // On open, snapshot the live appearance and seed the settings draft.
  useEffect(() => {
    if (!open) return;
    snapshot.current = appearance;
    setDraft(settings);
    setTab(initialTab);
    setMenuOpen(false);
    closeEditors();
    // Only re-run when the dialog opens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function update<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    setDraft((prev) => ({ ...prev, [key]: value }));
  }

  // ---- draft-side mode edits (committed with everything else on Save) -----

  const toggleMode = (id: ModeId, enabled: boolean) =>
    setDraft((prev) => {
      const next = enabled
        ? [...prev.enabledModes.filter((m) => m !== id), id]
        : prev.enabledModes.filter((m) => m !== id);
      // The switch never goes empty — the last enabled mode stays on.
      return { ...prev, enabledModes: next.length ? next : prev.enabledModes };
    });

  const toggleKey = (modeId: ModeId, keyId: string) =>
    setDraft((prev) => {
      const hidden = prev.hiddenKeys[modeId] ?? [];
      const next = hidden.includes(keyId)
        ? hidden.filter((k) => k !== keyId)
        : [...hidden, keyId];
      return { ...prev, hiddenKeys: { ...prev.hiddenKeys, [modeId]: next } };
    });

  const createCustomMode = (
    name: string,
    baseId: BuiltinModeId,
    hidden: string[],
  ) =>
    setDraft((prev) => {
      const id = `c-${crypto.randomUUID().slice(0, 8)}`;
      return {
        ...prev,
        customModes: [...prev.customModes, { id, name: name.trim(), baseId }],
        hiddenKeys: { ...prev.hiddenKeys, [id]: hidden },
        enabledModes: [...prev.enabledModes, id],
      };
    });

  const deleteCustomMode = (id: string) =>
    setDraft((prev) => {
      const hiddenKeys = { ...prev.hiddenKeys };
      delete hiddenKeys[id];
      const enabledModes = prev.enabledModes.filter((m) => m !== id);
      return {
        ...prev,
        customModes: prev.customModes.filter((m) => m.id !== id),
        hiddenKeys,
        enabledModes: enabledModes.length ? enabledModes : ["basic"],
      };
    });

  const allModes: { id: ModeId; name: string; custom?: CustomMode }[] = [
    ...BUILTIN_MODE_IDS.map((id) => ({ id, name: MODES[id].name })),
    ...draft.customModes.map((m) => ({ id: m.id, name: m.name, custom: m })),
  ];
  const editing = editingMode
    ? resolveMode(editingMode, draft.customModes)
    : null;

  const activeDef = TABS.find((t) => t.id === tab) ?? TABS[0];
  const ActiveIcon = activeDef.icon;

  function save() {
    onCommit(draft);
    onClose();
  }
  function cancel() {
    onAppearanceChange(snapshot.current); // discard the live preview
    onClose();
  }
  function reset() {
    onAppearanceChange(APP_LOOK);
    setDraft(DEFAULT_SETTINGS);
    closeEditors();
  }

  return (
    <Modal
      open={open}
      onClose={cancel}
      labelledBy="settings-title"
      closeLabel="Cancel"
      footer={
        // Reset (left) | Cancel + Save (right). The Modal owns the bottom
        // safe-area inset beneath this bar, so it keeps plain footer padding.
        <footer className="flex shrink-0 items-center justify-between gap-2 border-t border-line bg-surface-3 px-4 py-3">
          <Button variant="secondary" onClick={reset}>
            Reset to defaults
          </Button>
          <div className="flex items-center gap-2">
            <Button variant="secondary" onClick={cancel}>
              Cancel
            </Button>
            <Button variant="primary" onClick={save}>
              Save
            </Button>
          </div>
        </footer>
      }
    >
      {/* Header. On mobile the burger + active-tab label form one toggle that
          opens the section menu; on desktop the left rail owns selection and
          the header shows the static "Settings" title. The h2 stays mounted
          (sr-only on mobile) so `aria-labelledby` always resolves. */}
      <header className="relative flex shrink-0 items-center justify-between gap-2 border-b border-line bg-surface-3 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <div className="relative sm:hidden">
            <button
              ref={menuRef}
              type="button"
              onClick={() => setMenuOpen((v) => !v)}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label="Choose a section"
              className={`-ml-1 inline-flex cursor-pointer items-center gap-2 rounded border px-2 py-1 text-sm font-bold tracking-wide text-fg-bright ${
                menuOpen
                  ? "border-accent bg-accent/15"
                  : "border-transparent hover:border-line hover:bg-surface-2"
              }`}
            >
              <MenuIcon className="h-[18px] w-[18px] text-muted" />
              <span className="inline-flex shrink-0 text-accent">
                <ActiveIcon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">{activeDef.label}</span>
            </button>
            <FloatingPanel
              open={menuOpen}
              onClose={() => setMenuOpen(false)}
              triggerRef={menuRef}
              placement={MENU_PLACEMENT}
            >
              <div role="menu" className="flex w-full flex-col gap-0.5 p-2">
                {TABS.map((tabItem) => {
                  const Icon = tabItem.icon;
                  const isActive = tabItem.id === tab;
                  return (
                    <button
                      key={tabItem.id}
                      type="button"
                      role="menuitem"
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => {
                        closeEditors();
                        setTab(tabItem.id);
                        setMenuOpen(false);
                      }}
                      className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-surface ${
                        isActive ? "font-bold text-accent" : "text-fg"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span>{tabItem.label}</span>
                    </button>
                  );
                })}
              </div>
            </FloatingPanel>
          </div>
          <h2
            id="settings-title"
            className="sr-only text-sm font-bold tracking-wide text-fg-bright sm:not-sr-only"
          >
            <span className="inline-flex items-center gap-2">
              <span className="inline-flex shrink-0 text-accent">
                <CogIcon className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0">Settings</span>
            </span>
          </h2>
        </div>
        <button
          type="button"
          onClick={cancel}
          aria-label="Close"
          className="-mr-1 inline-flex h-9 w-9 cursor-pointer items-center justify-center rounded text-muted hover:bg-surface-2 hover:text-fg"
        >
          <CloseIcon className="h-5 w-5" />
        </button>
      </header>

      {/* Body: desktop tab rail (hidden on mobile, where the burger takes
          over) beside the scrolling tab panel. */}
      <div className="flex flex-1 overflow-hidden">
        <TabSidebar
          activeTab={tab}
          onSelect={(next) => {
            closeEditors();
            setTab(next);
          }}
        />

        {/* `settings-body` scopes the density-driven card spacing (see
            styles.css) so Appearance → Density tightens the settings cards
            themselves. `relative` makes this the containing block for its
            descendants' absolutely-positioned bits — chiefly each
            `ToggleRow`'s `sr-only` checkbox, which would otherwise resolve to
            the modal card and give it phantom overflow. */}
        <div
          role="tabpanel"
          id={`settings-tabpanel-${tab}`}
          aria-labelledby={`settings-tab-${tab}`}
          tabIndex={0}
          className="settings-body relative flex-1 overflow-x-hidden overflow-y-auto overscroll-contain px-4 py-4"
        >
          {tab === "general" ? (
            <Section title="Calculator">
              <ToggleRow
                label="Swipe down for history"
                hint="Drag the display downward to expand the session tape."
                checked={draft.swipeDownHistory}
                onChange={(next) => update("swipeDownHistory", next)}
              />
              <ToggleRow
                label="Key press animation"
                hint="Keys travel down when pressed."
                checked={draft.keyFeedback}
                onChange={(next) => update("keyFeedback", next)}
              />
            </Section>
          ) : null}

          {tab === "layouts" && !editing && draftBase === null ? (
            <>
              <Section title="Modes">
                <p className="mb-2 text-xs text-muted">
                  Enabled modes show as buttons in the top bar. Customize opens
                  the layout — press a button to remove it, press again to bring
                  it back.
                </p>
                {allModes.map((mode) => (
                  <div key={mode.id} className="flex items-center gap-2">
                    <div className="grow">
                      <ToggleRow
                        label={mode.name}
                        checked={draft.enabledModes.includes(mode.id)}
                        onChange={(next) => toggleMode(mode.id, next)}
                      />
                    </div>
                    <Button
                      variant="secondary"
                      onClick={() => setEditingMode(mode.id)}
                    >
                      Customize
                    </Button>
                    {mode.custom ? (
                      <Button
                        variant="ghost"
                        aria-label={`Delete ${mode.name}`}
                        onClick={() => deleteCustomMode(mode.id)}
                      >
                        <TrashIcon className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </Section>
              <Section title="New mode">
                <p className="mb-2 text-xs text-muted">
                  Start from a base layout, press away the buttons you don't
                  use, then name your mode.
                </p>
                <div className="flex flex-wrap gap-2">
                  {BUILTIN_MODE_IDS.map((id) => (
                    <Button
                      key={id}
                      variant="secondary"
                      onClick={() => {
                        setDraftBase(id);
                        setDraftHidden([...(draft.hiddenKeys[id] ?? [])]);
                        setDraftName("");
                      }}
                    >
                      Based on {MODES[id].name}
                    </Button>
                  ))}
                </div>
              </Section>
            </>
          ) : null}

          {tab === "layouts" && editing ? (
            <Section title={`Customize ${editing.name}`}>
              <p className="mb-1 text-xs text-muted">
                Press a highlighted button to remove it from the layout; press a
                dimmed one to bring it back. Plain buttons are always shown.
              </p>
              <div className="rounded-xl border border-line bg-page-bg">
                <Keypad
                  mode={editing}
                  hidden={draft.hiddenKeys[editing.id] ?? []}
                  keyFeedback={false}
                  editing
                  onToggleKey={(keyId) => toggleKey(editing.id, keyId)}
                />
              </div>
              <div className="mt-2 flex justify-end">
                <Button variant="primary" onClick={() => setEditingMode(null)}>
                  Done
                </Button>
              </div>
            </Section>
          ) : null}

          {tab === "layouts" && draftBase !== null ? (
            <Section title={`New mode from ${MODES[draftBase].name}`}>
              <p className="mb-1 text-xs text-muted">
                Press the buttons you want to remove, then name your mode.
              </p>
              <div className="rounded-xl border border-line bg-page-bg">
                <Keypad
                  mode={MODES[draftBase]}
                  hidden={draftHidden}
                  keyFeedback={false}
                  editing
                  onToggleKey={(keyId) =>
                    setDraftHidden((prev) =>
                      prev.includes(keyId)
                        ? prev.filter((k) => k !== keyId)
                        : [...prev, keyId],
                    )
                  }
                />
              </div>
              <div className="mt-2 flex items-center gap-2">
                <input
                  type="text"
                  value={draftName}
                  placeholder="Mode name"
                  aria-label="New mode name"
                  className="min-w-0 grow rounded-lg border border-line bg-surface-2 px-3 py-1.5 text-sm text-fg outline-none focus:border-accent"
                  onInput={(e) => setDraftName(e.currentTarget.value)}
                />
                <Button variant="ghost" onClick={closeEditors}>
                  Cancel
                </Button>
                <Button
                  variant="primary"
                  disabled={!draftName.trim()}
                  onClick={() => {
                    createCustomMode(draftName, draftBase, draftHidden);
                    closeEditors();
                  }}
                >
                  Create
                </Button>
              </div>
            </Section>
          ) : null}

          {tab === "appearance" ? (
            <AppearancePicker
              appearance={appearance}
              onChange={onAppearanceChange}
            />
          ) : null}

          {tab === "storage" ? (
            <Section title="Storage backend">
              <p className="mb-2 text-xs text-muted">
                Sessions are stored as markdown files. Settings stay on this
                device; nothing is stored until you connect a backend and save a
                session. Connecting applies straight away — it is not part of
                Save.
              </p>
              {connected ? (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm text-fg">
                    Connected: {backend ? BACKEND_NAMES[backend] : "—"}
                  </span>
                  <Button variant="danger" onClick={onDisconnect}>
                    Disconnect
                  </Button>
                </div>
              ) : folderReconnectNeeded ? (
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm text-muted">
                    This browser needs permission to reopen your folder.
                  </span>
                  <Button variant="primary" onClick={onReconnectFolder}>
                    Reconnect folder…
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {FOLDER_BACKEND_AVAILABLE ? (
                    <Button variant="secondary" onClick={onConnectFolder}>
                      Local folder…
                    </Button>
                  ) : null}
                  {DROPBOX_APP_KEY ? (
                    <Button variant="secondary" onClick={onConnectDropbox}>
                      Dropbox…
                    </Button>
                  ) : null}
                  {GOOGLE_CLIENT_ID ? (
                    <Button variant="secondary" onClick={onConnectGdrive}>
                      Google Drive…
                    </Button>
                  ) : null}
                  {!FOLDER_BACKEND_AVAILABLE &&
                  !DROPBOX_APP_KEY &&
                  !GOOGLE_CLIENT_ID ? (
                    <p className="text-sm text-muted">
                      No backend is available in this browser/build — see
                      docs/configuration.md.
                    </p>
                  ) : null}
                </div>
              )}
            </Section>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

// Desktop-only vertical tab rail (hidden below `sm`, where the header burger
// takes over). A WAI-ARIA tablist with roving tabindex and arrow-key
// navigation; activation follows focus to match the mouse / touch behaviour.
function TabSidebar({
  activeTab,
  onSelect,
}: {
  activeTab: SettingsTab;
  onSelect: (id: SettingsTab) => void;
}) {
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function handleKeyDown(
    e: ReactKeyboardEvent<HTMLButtonElement>,
    idx: number,
  ) {
    if (
      e.key !== "ArrowUp" &&
      e.key !== "ArrowDown" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    let next = idx;
    if (e.key === "ArrowUp") next = idx - 1;
    else if (e.key === "ArrowDown") next = idx + 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = TABS.length - 1;
    const nextDef = TABS[(next + TABS.length) % TABS.length];
    if (!nextDef) return;
    onSelect(nextDef.id);
    buttonRefs.current[nextDef.id]?.focus();
  }

  return (
    <div
      role="tablist"
      aria-orientation="vertical"
      aria-label="Settings sections"
      className="hidden w-44 shrink-0 flex-col gap-0.5 overflow-y-auto overscroll-contain border-r border-line bg-surface-3 p-2 sm:flex"
    >
      {TABS.map((tabItem, idx) => {
        const Icon = tabItem.icon;
        const active = tabItem.id === activeTab;
        return (
          <button
            key={tabItem.id}
            ref={(el) => {
              buttonRefs.current[tabItem.id] = el;
            }}
            type="button"
            role="tab"
            id={`settings-tab-${tabItem.id}`}
            aria-controls={`settings-tabpanel-${tabItem.id}`}
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(tabItem.id)}
            onKeyDown={(e) => handleKeyDown(e, idx)}
            className={`flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-left text-sm ${
              active
                ? "bg-accent/15 font-bold text-accent"
                : "text-fg hover:bg-surface-2"
            }`}
          >
            <Icon className="h-3.5 w-3.5" />
            <span>{tabItem.label}</span>
          </button>
        );
      })}
    </div>
  );
}
