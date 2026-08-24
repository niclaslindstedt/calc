// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { useCallback } from "react";

import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";

import {
  BUILTIN_MODE_IDS,
  parseCustomModes,
  type CustomMode,
  type ModeId,
} from "./modes.ts";

// App settings live in localStorage (the app's rule: localStorage for
// settings, never for session documents). The shape is versionless — unknown
// keys are dropped by the parse merge, missing ones fall back to defaults.
export type AppSettings = {
  // Reveal the tape by swiping down on the display (in addition to the
  // history toggle button).
  swipeDownHistory: boolean;
  // Pressed-down animation on keypad buttons.
  keyFeedback: boolean;
  // Mode ids offered in the top-bar switch — built-ins and custom modes the
  // user has turned on. Never empty (the parse guard restores "basic").
  enabledModes: ModeId[];
  // Per-mode hidden-key sets (Settings → Layouts, or the tap-to-toggle mode
  // editor). Keyed by mode id — built-in and custom alike.
  hiddenKeys: Record<string, string[]>;
  // User-defined modes: a named copy of a base layout (see modes.ts).
  customModes: CustomMode[];
};

const STORAGE_KEY = "calc:settings";

export const DEFAULT_SETTINGS: AppSettings = {
  swipeDownHistory: true,
  keyFeedback: true,
  enabledModes: [...BUILTIN_MODE_IDS],
  hiddenKeys: {},
  customModes: [],
};

function parseHiddenKeys(raw: unknown): Record<string, string[]> {
  if (typeof raw !== "object" || raw === null) return {};
  const out: Record<string, string[]> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (Array.isArray(value)) {
      out[key] = value.filter((v): v is string => typeof v === "string");
    }
  }
  return out;
}

function parseSettings(raw: string): AppSettings {
  try {
    const parsed = JSON.parse(raw) as Partial<AppSettings>;
    const customModes = parseCustomModes(parsed.customModes);
    const knownIds = new Set<string>([
      ...BUILTIN_MODE_IDS,
      ...customModes.map((m) => m.id),
    ]);
    const enabledModes = Array.isArray(parsed.enabledModes)
      ? parsed.enabledModes.filter(
          (id): id is string => typeof id === "string" && knownIds.has(id),
        )
      : DEFAULT_SETTINGS.enabledModes;
    return {
      swipeDownHistory:
        typeof parsed.swipeDownHistory === "boolean"
          ? parsed.swipeDownHistory
          : DEFAULT_SETTINGS.swipeDownHistory,
      keyFeedback:
        typeof parsed.keyFeedback === "boolean"
          ? parsed.keyFeedback
          : DEFAULT_SETTINGS.keyFeedback,
      enabledModes: enabledModes.length ? enabledModes : ["basic"],
      hiddenKeys: parseHiddenKeys(parsed.hiddenKeys),
      customModes,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function useAppSettings() {
  const [settings, setSettings] = useLocalStorageState<AppSettings>(
    STORAGE_KEY,
    DEFAULT_SETTINGS,
    { parse: parseSettings },
  );

  const update = useCallback(
    <K extends keyof AppSettings>(key: K, value: AppSettings[K]) =>
      setSettings((prev) => ({ ...prev, [key]: value })),
    [setSettings],
  );

  const toggleMode = useCallback(
    (id: ModeId, enabled: boolean) =>
      setSettings((prev) => {
        const next = enabled
          ? [...prev.enabledModes.filter((m) => m !== id), id]
          : prev.enabledModes.filter((m) => m !== id);
        // The switch never goes empty — the last enabled mode stays on.
        return {
          ...prev,
          enabledModes: next.length ? next : prev.enabledModes,
        };
      }),
    [setSettings],
  );

  const toggleKey = useCallback(
    (modeId: ModeId, keyId: string) =>
      setSettings((prev) => {
        const hidden = prev.hiddenKeys[modeId] ?? [];
        const next = hidden.includes(keyId)
          ? hidden.filter((k) => k !== keyId)
          : [...hidden, keyId];
        return {
          ...prev,
          hiddenKeys: { ...prev.hiddenKeys, [modeId]: next },
        };
      }),
    [setSettings],
  );

  // Create a custom mode from a base layout: `hidden` is the set of keys the
  // user pressed away in the editor. The new mode starts enabled.
  const createCustomMode = useCallback(
    (name: string, baseId: CustomMode["baseId"], hidden: string[]) => {
      const id = `c-${crypto.randomUUID().slice(0, 8)}`;
      setSettings((prev) => ({
        ...prev,
        customModes: [...prev.customModes, { id, name: name.trim(), baseId }],
        hiddenKeys: { ...prev.hiddenKeys, [id]: hidden },
        enabledModes: [...prev.enabledModes, id],
      }));
      return id;
    },
    [setSettings],
  );

  const deleteCustomMode = useCallback(
    (id: string) =>
      setSettings((prev) => {
        const hiddenKeys = { ...prev.hiddenKeys };
        delete hiddenKeys[id];
        const enabledModes = prev.enabledModes.filter((m) => m !== id);
        return {
          ...prev,
          customModes: prev.customModes.filter((m) => m.id !== id),
          hiddenKeys,
          enabledModes: enabledModes.length ? enabledModes : ["basic"],
        };
      }),
    [setSettings],
  );

  return {
    settings,
    update,
    toggleMode,
    toggleKey,
    createCustomMode,
    deleteCustomMode,
  };
}
