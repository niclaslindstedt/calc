// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The readout inside the calculator's display: the running result on top, big,
// the expression it came from underneath, and a thin third line for the error
// or the hex spelling. Its own component because Settings → Appearance draws
// the same three lines to preview the display text size — the picker shows the
// real thing rather than an impression of it.
//
// Only the expression line reveals character by character (the framework's
// `RevealText`).
// The result is recomputed wholesale on every keystroke, so animating it too
// would leave the display flickering rather than typing.

import { RevealText } from "@niclaslindstedt/oss-framework/expression";
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
// short of the three lines cuts the top off the result and then eats into the
// expression under it.
//
// So each step is the sum of what it draws, at the size it draws it: the
// result (`leading-none`, so its own type size), the expression line (1.4em
// of its own), the hex/error line (1.25rem), the two 0.25rem gaps between
// them, and the 1rem of padding the display carries top and bottom.
//
//   s    1.5  + 1.225 + 1.25 + 0.5 + 2 = 6.475rem
//   m    2.25 + 1.4   + 1.25 + 0.5 + 2 = 7.4rem
//   l    3    + 1.75  + 1.25 + 0.5 + 2 = 8.5rem
//   xl   3.75 + 2.1   + 1.25 + 0.5 + 2 = 9.6rem
//
// …rounded up to the next quarter rem, so a font whose metrics round the
// other way still has somewhere to put the difference.
export const DISPLAY_MIN_HEIGHT: Record<DisplayTextSize, string> = {
  s: "min-h-[6.5rem]",
  m: "min-h-[7.5rem]",
  l: "min-h-[8.75rem]",
  xl: "min-h-[9.75rem]",
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
