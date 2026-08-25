// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The readout inside the calculator's display: the running result on top, big,
// the expression it came from underneath, and a thin third line for the error
// or the hex spelling. Its own component because Settings → Appearance draws
// the same three lines to preview the display text size — the picker shows the
// real thing rather than an impression of it.
//
// Only the expression line reveals character by character (RevealText.tsx).
// The result is recomputed wholesale on every keystroke, so animating it too
// would leave the display flickering rather than typing.

import { RevealText } from "./RevealText.tsx";
import type { DisplayTextSize } from "./useAppSettings.ts";

// The display's two type sizes, stepped together by the Appearance picker. The
// result leads and the expression reads as its subtitle, so the pair keeps its
// ratio — only the scale moves.
const RESULT_TEXT_SIZE: Record<DisplayTextSize, string> = {
  s: "text-2xl",
  m: "text-4xl",
  l: "text-5xl",
  xl: "text-6xl",
};

const EXPRESSION_TEXT_SIZE: Record<DisplayTextSize, string> = {
  s: "text-sm",
  m: "text-base",
  l: "text-xl",
  xl: "text-2xl",
};

// The floor the display keeps for itself on the calculator screen. It grows
// into whatever the tape leaves, but it must never shrink under the type it
// was asked to draw — the readout is bottom-aligned and clipped, so a floor
// set for the small size would cut the top off the big one.
export const DISPLAY_MIN_HEIGHT: Record<DisplayTextSize, string> = {
  s: "min-h-[4.5rem]",
  m: "min-h-[5.5rem]",
  l: "min-h-[7rem]",
  xl: "min-h-[8.5rem]",
};

type Props = {
  // What the expression comes to — "0" on an empty display.
  result: string;
  // True while the result is holding over a half-typed expression ("12+")
  // that has no value of its own. It stays up, dimmed, rather than blanking
  // the headline on every operator press.
  stale: boolean;
  expression: string;
  error?: string | null;
  hex?: string | null;
  textSize: DisplayTextSize;
};

export function DisplayReadout({
  result,
  stale,
  expression,
  error = null,
  hex = null,
  textSize,
}: Props) {
  return (
    <>
      <output
        className={`w-full break-all text-right font-mono leading-none ${
          RESULT_TEXT_SIZE[textSize]
        } ${stale ? "text-muted" : "text-fg-bright"}`}
        aria-live="polite"
      >
        {result}
      </output>
      {/* The expression itself, under its answer — the line the keypad types
          into, so this is where characters reveal. */}
      <RevealText
        text={expression}
        className={`block min-h-[1.4em] w-full break-all text-right font-mono leading-snug text-fg ${EXPRESSION_TEXT_SIZE[textSize]}`}
      />
      <div className="min-h-5 text-right font-mono text-xs text-muted">
        {error ? (
          <span className="text-danger">{error}</span>
        ) : hex ? (
          <span>{hex}</span>
        ) : null}
      </div>
    </>
  );
}
