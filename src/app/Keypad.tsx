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
  return (
    <div
      className="grid shrink-0 gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
      style={{ gridTemplateColumns: `repeat(${mode.columns}, minmax(0, 1fr))` }}
      role={editing ? "group" : undefined}
      aria-label={editing ? `Edit ${mode.name} layout` : undefined}
    >
      {keys.map((key) => {
        const isHidden = hidden.includes(key.id);
        return (
          <button
            key={key.id}
            type="button"
            className={`h-12 rounded-xl font-mono text-lg select-none sm:h-14 sm:text-xl ${toneClasses(
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
