// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0

import { useLocalStorageState } from "@niclaslindstedt/oss-framework/hooks";

import {
  BUILTIN_MODE_IDS,
  parseCustomModes,
  type CustomMode,
  type ModeId,
} from "./modes.ts";

/** How the sidebar opens on a phone. `button` shows the draggable floating
 *  menu button; `swipe` hides it and opens the drawer with an inward swipe
 *  from the button's edge instead. Either/or — the same choice the contacts
 *  sibling offers, so the two apps feel the same in the hand. */
export type MenuMode = "button" | "swipe";

/** Keypad button text size (Settings → Appearance). `m` is the size the pad
 *  has always used; the rest step the cap label up or down. */
export type KeyTextSize = "s" | "m" | "l" | "xl";

/** The size steps, in picker order — the labels the Appearance tab shows. */
export const KEY_TEXT_SIZES: { id: KeyTextSize; label: string }[] = [
  { id: "s", label: "Small" },
  { id: "m", label: "Medium" },
  { id: "l", label: "Large" },
  { id: "xl", label: "Huge" },
];

function isKeyTextSize(raw: unknown): raw is KeyTextSize {
  return KEY_TEXT_SIZES.some((size) => size.id === raw);
}

// App settings live in localStorage (the app's rule: localStorage for
// settings, never for session documents). The shape is versionless — unknown
// keys are dropped by the parse merge, missing ones fall back to defaults.
export type AppSettings = {
  // How the phone drawer opens: the floating button, or an edge swipe.
  menuMode: MenuMode;
  // How large the keypad's button labels are drawn.
  keyTextSize: KeyTextSize;
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
  menuMode: "button",
  keyTextSize: "m",
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
      menuMode: parsed.menuMode === "swipe" ? "swipe" : "button",
      keyTextSize: isKeyTextSize(parsed.keyTextSize)
        ? parsed.keyTextSize
        : DEFAULT_SETTINGS.keyTextSize,
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

  // The whole object at once: the Settings dialog stages every knob in a
  // draft and hands it over on Save (see SettingsModal.tsx), so there is
  // nothing here to update key by key.
  return { settings, commit: setSettings };
}
