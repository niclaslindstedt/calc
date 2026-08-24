// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// Settings dialog, tabbed like the sibling apps: General, Layouts (enable /
// disable modes, customize a mode's buttons by pressing them, create new
// modes from a base layout), Appearance (the framework theme picker — same
// themes as the siblings), and Storage (backend connection).

import { useState } from "react";

import {
  Button,
  Modal,
  Section,
  SegmentedControl,
  ToggleRow,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";
import {
  AppearancePicker,
  type ThemeAppearance,
} from "@niclaslindstedt/oss-framework/theme";

import { Keypad } from "./Keypad.tsx";
import {
  BUILTIN_MODE_IDS,
  MODES,
  resolveMode,
  type BuiltinModeId,
  type CustomMode,
  type ModeId,
} from "./modes.ts";
import type { AppSettings } from "./useAppSettings.ts";
import type { BackendId } from "./store.ts";
import {
  DROPBOX_APP_KEY,
  FOLDER_BACKEND_AVAILABLE,
  GOOGLE_CLIENT_ID,
} from "./store.ts";

type Tab = "general" | "layouts" | "appearance" | "storage";

type Props = {
  open: boolean;
  onClose: () => void;
  settings: AppSettings;
  onUpdate: <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => void;
  onToggleMode: (id: ModeId, enabled: boolean) => void;
  onToggleKey: (modeId: ModeId, keyId: string) => void;
  onCreateCustomMode: (
    name: string,
    baseId: BuiltinModeId,
    hidden: string[],
  ) => void;
  onDeleteCustomMode: (id: string) => void;
  appearance: ThemeAppearance;
  onAppearanceChange: (next: ThemeAppearance) => void;
  backend: BackendId | null;
  connected: boolean;
  onConnectFolder: () => void;
  onConnectDropbox: () => void;
  onConnectGdrive: () => void;
  onDisconnect: () => void;
  initialTab?: Tab;
};

const TABS: { id: Tab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "layouts", label: "Layouts" },
  { id: "appearance", label: "Appearance" },
  { id: "storage", label: "Storage" },
];

export function SettingsModal({
  open,
  onClose,
  settings,
  onUpdate,
  onToggleMode,
  onToggleKey,
  onCreateCustomMode,
  onDeleteCustomMode,
  appearance,
  onAppearanceChange,
  backend,
  connected,
  onConnectFolder,
  onConnectDropbox,
  onConnectGdrive,
  onDisconnect,
  initialTab = "general",
}: Props) {
  const [tab, setTab] = useState<Tab>(initialTab);
  // The mode currently opened in the press-to-toggle button editor.
  const [editingMode, setEditingMode] = useState<ModeId | null>(null);
  // The "new mode" draft: base layout, pressed-away keys, name.
  const [draftBase, setDraftBase] = useState<BuiltinModeId | null>(null);
  const [draftHidden, setDraftHidden] = useState<string[]>([]);
  const [draftName, setDraftName] = useState("");

  const allModes: { id: ModeId; name: string; custom?: CustomMode }[] = [
    ...BUILTIN_MODE_IDS.map((id) => ({ id, name: MODES[id].name })),
    ...settings.customModes.map((m) => ({ id: m.id, name: m.name, custom: m })),
  ];

  const editing = editingMode
    ? resolveMode(editingMode, settings.customModes)
    : null;

  const closeEditors = () => {
    setEditingMode(null);
    setDraftBase(null);
    setDraftHidden([]);
    setDraftName("");
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        closeEditors();
        onClose();
      }}
      labelledBy="settings-title"
      size="lg"
    >
      <div className="flex flex-col gap-4 p-4">
        <h2
          id="settings-title"
          className="text-lg font-semibold text-fg-bright"
        >
          Settings
        </h2>
        <SegmentedControl<Tab>
          value={tab}
          options={TABS.map((t) => ({ value: t.id, label: t.label }))}
          onChange={(next) => {
            closeEditors();
            setTab(next);
          }}
          ariaLabel="Settings sections"
          fullWidth
        />

        {tab === "general" ? (
          <Section title="Calculator">
            <ToggleRow
              label="Swipe down for history"
              hint="Drag the display downward to reveal the session tape."
              checked={settings.swipeDownHistory}
              onChange={(next) => onUpdate("swipeDownHistory", next)}
            />
            <ToggleRow
              label="Key press animation"
              hint="Keys travel down when pressed."
              checked={settings.keyFeedback}
              onChange={(next) => onUpdate("keyFeedback", next)}
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
                      checked={settings.enabledModes.includes(mode.id)}
                      onChange={(next) => onToggleMode(mode.id, next)}
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
                      onClick={() => onDeleteCustomMode(mode.id)}
                    >
                      <TrashIcon />
                    </Button>
                  ) : null}
                </div>
              ))}
            </Section>
            <Section title="New mode">
              <p className="mb-2 text-xs text-muted">
                Start from a base layout, press away the buttons you don't use,
                then name your mode.
              </p>
              <div className="flex gap-2">
                {BUILTIN_MODE_IDS.map((id) => (
                  <Button
                    key={id}
                    variant="secondary"
                    onClick={() => {
                      setDraftBase(id);
                      setDraftHidden([...(settings.hiddenKeys[id] ?? [])]);
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
                hidden={settings.hiddenKeys[editing.id] ?? []}
                keyFeedback={false}
                editing
                onToggleKey={(keyId) => onToggleKey(editing.id, keyId)}
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
                  onCreateCustomMode(draftName, draftBase, draftHidden);
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
              session.
            </p>
            {connected ? (
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm text-fg">
                  Connected:{" "}
                  {backend === "folder"
                    ? "Local folder"
                    : backend === "dropbox"
                      ? "Dropbox"
                      : "Google Drive"}
                </span>
                <Button variant="danger" onClick={onDisconnect}>
                  Disconnect
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
    </Modal>
  );
}
