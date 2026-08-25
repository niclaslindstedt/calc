// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The keypad grid for one mode. Two faces:
//   - normal: pressing a key feeds the calculator; keys wear a raised,
//     pressed-down-on-tap look (the resting drop edge collapses and the cap
//     travels), gated by the "key feedback" setting.
//   - editing (the mode editor): every key is shown, hidden ones dimmed;
//     tapping an optional key toggles it in/out of the layout, and required
//     keys just wiggle their lock state via aria — pressing buttons is the
//     whole editing gesture.

import { visibleKeys, type KeyDef, type Mode } from "./modes.ts";

type Props = {
  mode: Mode;
  hidden: readonly string[];
  keyFeedback: boolean;
  onKey?: (key: KeyDef) => void;
  onBackspaceAlt?: () => void;
  editing?: boolean;
  onToggleKey?: (keyId: string) => void;
};

function toneClasses(tone: KeyDef["tone"]): string {
  switch (tone) {
    case "accent":
      return "bg-accent text-page-bg";
    case "op":
      return "bg-surface-3 text-accent";
    case "fn":
      return "bg-surface-3 text-fg";
    case "muted":
      return "bg-surface-2 text-muted";
    default:
      return "bg-surface-2 text-fg-bright";
  }
}

// The raised cap: a solid edge below the key that vanishes as the cap
// travels down on press — the "physically pressed" look.
const PRESS_ANIMATION =
  "shadow-[0_3px_0_0_var(--color-line)] transition-[transform,box-shadow,filter] duration-75 " +
  "active:translate-y-[3px] active:shadow-none active:brightness-125";

// How many rows the layout flows into — the pad's floor height derives from
// it, so a tall layout on a short screen keeps every row (the display gives
// up the space instead of the bottom row being clipped away).
function rowCount(keys: readonly KeyDef[], columns: number): number {
  let used = 0;
  let rows = 1;
  for (const key of keys) {
    const span = Math.min(key.span ?? 1, columns);
    if (used + span > columns) {
      rows += 1;
      used = span;
    } else {
      used += span;
    }
  }
  return rows;
}

// A key's smallest comfortable box, and the gap between keys — the row floor
// above is written in these terms, so they stay in step with the classes.
const MIN_KEY_HEIGHT = "2.5rem";
const KEY_GAP = "0.5rem";

export function Keypad({
  mode,
  hidden,
  keyFeedback,
  onKey,
  onBackspaceAlt,
  editing = false,
  onToggleKey,
}: Props) {
  const keys = editing ? mode.keys : visibleKeys(mode, hidden);
  const rows = rowCount(keys, mode.columns);
  return (
    <div
      className={
        "grid shrink-0 gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] " +
        // In the app the pad claims the bottom slab of the screen and its rows
        // stretch into it (capped so a tall phone doesn't grow thumb-sized
        // keys); in the mode editor it sits in a scrolling modal and sizes to
        // its content instead.
        (editing ? "" : "max-h-[58%] grow")
      }
      style={
        editing
          ? { gridTemplateColumns: `repeat(${mode.columns}, minmax(0, 1fr))` }
          : {
              gridTemplateColumns: `repeat(${mode.columns}, minmax(0, 1fr))`,
              gridAutoRows: `minmax(${MIN_KEY_HEIGHT}, 1fr)`,
              // The floor outranks the cap above (CSS resolves min-height
              // last), so on a screen too short for both the display and a
              // seven-row layout the rows survive whole.
              minHeight:
                `calc(${rows} * ${MIN_KEY_HEIGHT} + ${rows - 1} * ${KEY_GAP}` +
                ` + 0.75rem + max(0.75rem, env(safe-area-inset-bottom)))`,
            }
      }
      role={editing ? "group" : undefined}
      aria-label={editing ? `Edit ${mode.name} layout` : undefined}
    >
      {keys.map((key) => {
        const isHidden = hidden.includes(key.id);
        return (
          <button
            key={key.id}
            type="button"
            className={`${
              editing ? "h-12" : "h-full min-h-10"
            } rounded-xl font-mono text-lg select-none sm:text-xl ${toneClasses(
              key.tone,
            )} ${keyFeedback && !editing ? PRESS_ANIMATION : ""} ${
              editing
                ? isHidden
                  ? "opacity-30 line-through"
                  : key.optional
                    ? "ring-1 ring-accent/40"
                    : "opacity-70"
                : ""
            }`}
            style={key.span ? { gridColumn: `span ${key.span}` } : undefined}
            aria-pressed={editing ? !isHidden : undefined}
            aria-disabled={editing && !key.optional ? true : undefined}
            title={
              editing
                ? key.optional
                  ? isHidden
                    ? `Show ${key.label}`
                    : `Hide ${key.label}`
                  : `${key.label} is always shown`
                : undefined
            }
            onClick={() => {
              if (editing) {
                if (key.optional) onToggleKey?.(key.id);
                return;
              }
              onKey?.(key);
            }}
            onContextMenu={(e) => {
              // Long-press / right-click on C = backspace, so basic mode
              // keeps a delete without spending a key on it.
              if (!editing && key.action === "clear" && onBackspaceAlt) {
                e.preventDefault();
                onBackspaceAlt();
              }
            }}
          >
            {key.label}
          </button>
        );
      })}
    </div>
  );
}
