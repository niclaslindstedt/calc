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
//   - preview (Settings → Appearance): the trimmed layout at the editor's
//     compact size, inert and hidden from assistive tech — it exists only to
//     show what a button-text size looks like.

import { useState } from "react";

import { useLongPress } from "@niclaslindstedt/oss-framework/hooks";

import { layoutRows, type KeyDef, type Mode, type PlacedKey } from "./modes.ts";
import type { KeyTextSize } from "./useAppSettings.ts";

type Props = {
  mode: Mode;
  hidden: readonly string[];
  keyFeedback: boolean;
  // How large the cap labels are drawn (Settings → Appearance). Defaults to
  // the size the pad has always used, so the editor previews can leave it out.
  textSize?: KeyTextSize;
  // The erase key reads the display: `⌫` while there are characters to take
  // back, `C` once there are none. The two faces carry different actions, so
  // the label is not just cosmetic — see CalculatorScreen.
  clearIsBackspace?: boolean;
  onKey?: (key: KeyDef) => void;
  // The key a hardware keystroke just landed on, so the pad lights the cap
  // that answered it. The pad tracks its own pointer presses; this is only
  // the keyboard's half. See CalculatorScreen's `keyIdForKeystroke`.
  pressedKeyId?: string | null;
  // Long press (or right-click) on a key that has a second gesture. Only the
  // erase key does today.
  onKeyLongPress?: (key: KeyDef) => void;
  editing?: boolean;
  onToggleKey?: (keyId: string) => void;
  // A look-only pad: no press handling, no editor decorations, and out of the
  // accessibility tree so it doesn't read as a second keypad.
  preview?: boolean;
};

// The cap-label steps behind Settings → Appearance → "Button text size".
// Each step keeps the small-screen/`sm:` pairing the pad has always had, so a
// wider screen still gets the roomier size.
const TEXT_SIZE_CLASSES: Record<KeyTextSize, string> = {
  s: "text-base sm:text-lg",
  m: "text-lg sm:text-xl",
  l: "text-2xl sm:text-3xl",
  xl: "text-3xl sm:text-4xl",
};

// Every cap answers the pointer: a cursor that says "press me", and a hover
// tone one step brighter than its resting fill. `hover:` only ever matches a
// device that can actually hover, so this costs a phone nothing.
function toneClasses(tone: KeyDef["tone"]): string {
  switch (tone) {
    case "accent":
      return "bg-accent text-page-bg hover:brightness-110";
    case "op":
      return "bg-surface-3 text-accent hover:bg-surface-2";
    case "fn":
      return "bg-surface-3 text-fg hover:bg-surface-2 hover:text-fg-bright";
    case "muted":
      return "bg-surface-2 text-muted hover:bg-surface-3 hover:text-fg";
    default:
      return "bg-surface-2 text-fg-bright hover:bg-surface-3";
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
  // Sizes the label relative to the cap's own text size. The erase key's `⌫`
  // is drawn small inside its em box, so it needs scaling up to carry the same
  // weight as a digit.
  labelClassName?: string;
  hint?: string;
  ariaLabel?: string;
  className: string;
  onPress: () => void;
  // Held down right now (pointer or hardware key) — see the `calc-key-hit`
  // rules in styles.css.
  hit?: boolean;
  // The pointer went down on / came off this cap, so the pad can track which
  // key is under the finger.
  onHitStart?: () => void;
  onHitEnd?: () => void;
  // Absent when the key has no second gesture; the framework hook swallows
  // the click that trails a long press, so a tap and a hold never both fire.
  onLongPress?: () => void;
  ariaPressed?: boolean;
  ariaDisabled?: boolean;
};

function KeypadKey({
  keyDef,
  label,
  labelClassName,
  hint,
  ariaLabel,
  className,
  onPress,
  hit,
  onHitStart,
  onHitEnd,
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
      className={`${className}${hit ? " calc-key-hit" : ""}`}
      style={
        keyDef.span > 1 ? { gridColumn: `span ${keyDef.span}` } : undefined
      }
      aria-pressed={ariaPressed}
      aria-disabled={ariaDisabled}
      aria-label={ariaLabel}
      title={hint}
      onClick={onPress}
      {...longPress}
      // Composed over the long-press handlers rather than before them: the
      // spread would otherwise drop whichever of the two came first, and both
      // want the same pointer events.
      onPointerDown={(e) => {
        longPress.onPointerDown?.(e);
        onHitStart?.();
      }}
      onPointerUp={(e) => {
        longPress.onPointerUp?.(e);
        onHitEnd?.();
      }}
      onPointerLeave={(e) => {
        longPress.onPointerLeave?.(e);
        onHitEnd?.();
      }}
      onPointerCancel={(e) => {
        longPress.onPointerCancel?.(e);
        onHitEnd?.();
      }}
      onContextMenu={(e) => {
        // Right-click reaches the long press on a desktop pointer, where
        // there is nothing to hold.
        if (!onLongPress) return;
        e.preventDefault();
        onLongPress();
      }}
    >
      {labelClassName ? <span className={labelClassName}>{label}</span> : label}
    </button>
  );
}

export function Keypad({
  mode,
  hidden,
  keyFeedback,
  textSize = "m",
  clearIsBackspace = false,
  onKey,
  pressedKeyId,
  onKeyLongPress,
  editing = false,
  onToggleKey,
  preview = false,
}: Props) {
  // Which cap the pointer is currently holding down. The hardware keyboard's
  // half of the same question arrives as `pressedKeyId`; a cap lights for
  // either, so a typed `3` and a tapped `3` are felt the same way.
  const [touched, setTouched] = useState<string | null>(null);
  // The editor shows the whole layout (hidden keys dimmed in place, so the
  // grid doesn't reflow under the finger doing the hiding); the app and the
  // preview show the trimmed layout packed into full rows.
  const placed = editing ? layoutRows(mode) : layoutRows(mode, hidden);
  const keys = placed.flat();
  const rows = placed.length;
  // Both in-modal faces size to their content instead of claiming a screen.
  const inModal = editing || preview;
  return (
    <div
      className={
        "grid shrink-0 gap-2 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] " +
        // In the app the pad claims the bottom slab of the screen and its rows
        // stretch into it (capped so a tall phone doesn't grow thumb-sized
        // keys); in the mode editor and the preview it sits in a scrolling
        // modal and sizes to its content instead.
        (inModal ? "" : "max-h-[58%] grow") +
        (preview ? " pointer-events-none" : "")
      }
      aria-hidden={preview ? true : undefined}
      // The calculator screen measures this pad's floor to know when the tape
      // has squeezed the keys past the point of being usable — see the tape
      // handle in CalculatorScreen.tsx. Only the in-app pad is a candidate.
      data-calc-keypad={inModal ? undefined : ""}
      style={
        inModal
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
            // `⌫` sits small inside its em box — left at the cap's own size it
            // reads as a footnote beside the digits. Scale it back up to their
            // visual weight.
            labelClassName={
              isBackspace ? "text-[1.7em] leading-none" : undefined
            }
            ariaLabel={
              editing || key.action !== "clear"
                ? undefined
                : isBackspace
                  ? "Backspace"
                  : "Clear"
            }
            className={`${
              inModal ? "h-12" : "h-full min-h-10"
            } relative rounded-xl font-mono select-none ${
              TEXT_SIZE_CLASSES[textSize]
            } ${toneClasses(key.tone)} ${
              key.tone === "accent" ? "calc-key-accent" : ""
            } ${keyFeedback && !editing ? PRESS_ANIMATION : ""} ${
              editing
                ? isHidden
                  ? "opacity-30 line-through"
                  : key.optional
                    ? "ring-1 ring-accent/40"
                    : "opacity-70"
                : ""
            }`}
            hit={!inModal && (touched === key.id || pressedKeyId === key.id)}
            onHitStart={inModal ? undefined : () => setTouched(key.id)}
            onHitEnd={inModal ? undefined : () => setTouched(null)}
            ariaPressed={editing ? !isHidden : undefined}
            ariaDisabled={editing && !key.optional ? true : undefined}
            hint={
              preview
                ? undefined
                : editing
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
