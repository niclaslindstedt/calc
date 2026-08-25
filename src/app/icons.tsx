// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The glyphs this app draws that the framework's set does not carry. They
// follow the framework's `Glyph` shape exactly — a 24×24 box, no fill, 2px
// round-capped `currentColor` strokes — so they sit next to `CopyIcon` and
// friends without reading as a different family.

type IconProps = { className?: string };

/**
 * A clipboard with an arrow coming down into it — the paste half of the
 * display's clipboard bar (ClipboardPill.tsx). The framework has `CopyIcon`
 * for the outward direction but nothing for the inward one.
 */
export function PasteIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="M12 10v7" />
      <path d="m9 14 3 3 3-3" />
    </svg>
  );
}

/**
 * Six dots in two rows — the grab handle sitting on the hairline between the
 * tape and the display (CalculatorScreen.tsx). The seam is a single pixel, so
 * the glyph is all the affordance there is: it has to say "this line moves"
 * on its own. Dots rather than bars, which at this size would read as the
 * `=` key a few centimetres below.
 */
export function GrabHandleIcon({ className }: IconProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      focusable="false"
      className={className}
    >
      <path d="M5 10h.01M12 10h.01M19 10h.01" />
      <path d="M5 14h.01M12 14h.01M19 14h.01" />
    </svg>
  );
}
