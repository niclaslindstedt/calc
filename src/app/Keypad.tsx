// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The keypad grid for one mode. Two faces:
//   - normal: pressing a key feeds the calculator; a pressed key lights and
//     takes an accent inline, gated by the "key feedback" setting. The erase
//     key also takes a long press — see `clearIsBackspace` below.
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

// A key's fill and glyph, as one of the tone classes in styles.css. Each sets
// `--calc-key-bg` / `--calc-key-fg` off the theme's own tokens, so the pad's
// light-digits-over-dark-everything-else hierarchy survives a theme swap
// rather than being pinned to the amber-on-black look the app boots in.
function toneClass(tone: KeyDef["tone"]): string {
  switch (tone) {
    case "accent":
      return "calc-key-accent";
    case "op":
      return "calc-key-op";
    case "fn":
      return "calc-key-fn";
    case "muted":
      return "calc-key-muted";
    case "danger":
      return "calc-key-danger";
    default:
      return "calc-key-digit";
  }
}

// The pressed key: lit, with an inline of its own hit colour drawn just
// inside the hairline it shares with its neighbours (styles.css).
const PRESS_ANIMATION = "calc-key-press";

// A key's smallest comfortable box, and the hairline between keys — the row
// floor below is written in these terms, and the hairline *is* the grid gap
// (the slab's own background showing between the cells), so they stay in step
// with the classes.
const MIN_KEY_HEIGHT = "2.5rem";
const KEY_GAP = "1px";

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
        keyDef.span > 1 || keyDef.rowSpan > 1
          ? {
              ...(keyDef.span > 1
                ? { gridColumn: `span ${keyDef.span}` }
                : null),
              // A tall key (the basic pad's `+`) takes its column in the row
              // below too; the keys of that row are packed around it, so
              // auto-placement flows them into what is left.
              ...(keyDef.rowSpan > 1
                ? { gridRow: `span ${keyDef.rowSpan}` }
                : null),
            }
          : undefined
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
    // Two boxes, because the pad has two jobs: the outer one holds the pad off
    // the edges of the screen (and off the home indicator) and is what the
    // calculator screen measures; the inner one is the slab the keys are cut
    // out of.
    <div
      className={
        "shrink-0 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]" +
        // In the app the pad claims the bottom slab of the screen and its rows
        // stretch into it (capped so a tall phone doesn't grow thumb-sized
        // keys); in the mode editor and the preview it sits in a scrolling
        // modal and sizes to its content instead.
        (inModal ? "" : " max-h-[58%] grow") +
        (preview ? " pointer-events-none" : "")
      }
      aria-hidden={preview ? true : undefined}
      // The calculator screen measures this pad's floor to know when the tape
      // has squeezed the keys past the point of being usable — see the tape
      // handle in CalculatorScreen.tsx. Only the in-app pad is a candidate.
      data-calc-keypad={inModal ? undefined : ""}
      style={
        inModal
          ? undefined
          : {
              // The floor outranks the cap above (CSS resolves min-height
              // last), so on a screen too short for both the display and a
              // seven-row layout the rows survive whole. The padding is in
              // here because the box is sized border-box.
              minHeight:
                `calc(${rows} * ${MIN_KEY_HEIGHT} + ${rows - 1} * ${KEY_GAP}` +
                ` + 0.75rem + max(0.75rem, env(safe-area-inset-bottom)))`,
            }
      }
    >
      {/* One rounded box, not a tray of separate caps: the grid paints the
          line colour and holds its cells a hairline apart, so the gaps are the
          rules between keys, and clipping rounds the four corner keys into the
          box. See the `calc-pad` rules in styles.css. */}
      <div
        className={`calc-pad grid gap-px overflow-hidden rounded-2xl ${
          inModal ? "" : "h-full"
        }`}
        style={{
          gridTemplateColumns: `repeat(${mode.columns}, minmax(0, 1fr))`,
          ...(inModal
            ? null
            : { gridAutoRows: `minmax(${MIN_KEY_HEIGHT}, 1fr)` }),
        }}
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
              className={`calc-key ${
                // A floor rather than a fixed height, so a key that spans two
                // rows (the basic pad's tall `+`) still fills both of them —
                // a short key would leave the slab showing through the rest
                // of its box.
                inModal ? "min-h-12" : "h-full min-h-10"
              } relative font-mono select-none ${
                TEXT_SIZE_CLASSES[textSize]
              } ${toneClass(key.tone)} ${
                keyFeedback && !editing ? PRESS_ANIMATION : ""
              } ${
                editing
                  ? isHidden
                    ? "opacity-30 line-through"
                    : key.optional
                      ? // Inset, so the marker sits inside the key rather than
                        // over the hairline it shares with its neighbour.
                        "ring-1 ring-accent/50 ring-inset"
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
    </div>
  );
}
