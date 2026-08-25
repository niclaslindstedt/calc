// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The keypad grid for one mode. Two faces:
//   - normal: pressing a key feeds the calculator; keys wear a raised,
//     pressed-down-on-tap look (the resting drop edge collapses and the cap
//     travels), gated by the "key feedback" setting. The erase key also takes
//     a long press — see `clearIsBackspace` below.
//   - editing (the mode editor): every key is shown, hidden ones dimmed;
//     tapping an optional key toggles it in/out of the layout, and required
//     keys just wiggle their lock state via aria — pressing buttons is the
//     whole editing gesture.

import { useLongPress } from "@niclaslindstedt/oss-framework/hooks";

import { layoutRows, type KeyDef, type Mode, type PlacedKey } from "./modes.ts";

type Props = {
  mode: Mode;
  hidden: readonly string[];
  keyFeedback: boolean;
  // The erase key reads the display: `⌫` while there are characters to take
  // back, `C` once there are none. The two faces carry different actions, so
  // the label is not just cosmetic — see CalculatorScreen.
  clearIsBackspace?: boolean;
  onKey?: (key: KeyDef) => void;
  // Long press (or right-click) on a key that has a second gesture. Only the
  // erase key does today.
  onKeyLongPress?: (key: KeyDef) => void;
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

// A key's smallest comfortable box, and the gap between keys — the row floor
// above is written in these terms, so they stay in step with the classes.
const MIN_KEY_HEIGHT = "2.5rem";
const KEY_GAP = "0.5rem";

type KeyProps = {
  keyDef: PlacedKey;
  // What the cap reads — the erase key's differs from the authored label.
  label: string;
  hint?: string;
  ariaLabel?: string;
  className: string;
  onPress: () => void;
  // Absent when the key has no second gesture; the framework hook swallows
  // the click that trails a long press, so a tap and a hold never both fire.
  onLongPress?: () => void;
  ariaPressed?: boolean;
  ariaDisabled?: boolean;
};

function KeypadKey({
  keyDef,
  label,
  hint,
  ariaLabel,
  className,
  onPress,
  onLongPress,
  ariaPressed,
  ariaDisabled,
}: KeyProps) {
  const longPress = useLongPress(() => onLongPress?.(), {
    enabled: Boolean(onLongPress),
  });
  return (
    <button
      type="button"
      className={className}
      style={
        keyDef.span > 1 ? { gridColumn: `span ${keyDef.span}` } : undefined
      }
      aria-pressed={ariaPressed}
      aria-disabled={ariaDisabled}
      aria-label={ariaLabel}
      title={hint}
      onClick={onPress}
      {...longPress}
      onContextMenu={(e) => {
        // Right-click reaches the long press on a desktop pointer, where
        // there is nothing to hold.
        if (!onLongPress) return;
        e.preventDefault();
        onLongPress();
      }}
    >
      {label}
    </button>
  );
}

export function Keypad({
  mode,
  hidden,
  keyFeedback,
  clearIsBackspace = false,
  onKey,
  onKeyLongPress,
  editing = false,
  onToggleKey,
}: Props) {
  // The editor shows the whole layout (hidden keys dimmed in place, so the
  // grid doesn't reflow under the finger doing the hiding); the app shows the
  // trimmed layout packed into full rows.
  const placed = editing ? layoutRows(mode) : layoutRows(mode, hidden);
  const keys = placed.flat();
  const rows = placed.length;
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
        // The erase key is the one cap whose face moves with the display.
        const isBackspace =
          !editing && key.action === "clear" && clearIsBackspace;
        return (
          <KeypadKey
            key={key.id}
            keyDef={key}
            label={isBackspace ? "⌫" : key.label}
            ariaLabel={
              editing || key.action !== "clear"
                ? undefined
                : isBackspace
                  ? "Backspace"
                  : "Clear"
            }
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
            ariaPressed={editing ? !isHidden : undefined}
            ariaDisabled={editing && !key.optional ? true : undefined}
            hint={
              editing
                ? key.optional
                  ? isHidden
                    ? `Show ${key.label}`
                    : `Hide ${key.label}`
                  : `${key.label} is always shown`
                : key.action === "clear"
                  ? isBackspace
                    ? "Erase a character; hold to erase them all"
                    : "Nothing to erase; hold to clear the history"
                  : undefined
            }
            onPress={() => {
              if (editing) {
                if (key.optional) onToggleKey?.(key.id);
                return;
              }
              onKey?.(key);
            }}
            onLongPress={
              !editing && key.action === "clear" && onKeyLongPress
                ? () => onKeyLongPress(key)
                : undefined
            }
          />
        );
      })}
    </div>
  );
}
