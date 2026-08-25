// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The in-place copy confirmation: a small label that flicks up over the value
// it just took, so the eye never leaves the number.
//
// It is **portalled to `document.body`** for the same reason the clipboard
// bar is (ClipboardPill.tsx). The tape is a scroll container, so a label
// nested in a row and riding above the row's top edge is clipped by it — and
// the topmost row sits directly under the top bar, which is exactly where the
// clipping showed: the confirmation for the newest entry came out sheared in
// half. Out of the tree it has nothing to be cut by, and it draws *over* the
// top bar instead of under it.
//
// It still rides the anchor's top edge, half above and half below, unless
// that would take it off the top of the screen — then it drops just inside
// the anchor and sits over the value instead.

import { useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

/** How far in from the anchor's right edge the label's own right edge sits. */
const INSET_PX = 16;

/** Half the label's height — how far above the anchor's edge it reaches. */
const HALF_HEIGHT_PX = 11;

export function CopiedFlash({
  /** What was copied, in the tape's words. Null while nothing is confirmed. */
  label,
  /** The box the label rides — the row (or the display) that was copied. */
  anchorRef,
}: {
  label: string | null;
  anchorRef: RefObject<HTMLElement | null>;
}) {
  // Positioned by its `right` edge rather than its left: a fixed box whose
  // left edge sits near the right of the screen has only those few pixels to
  // lay itself out in, and the label wraps to one word per line — a transform
  // pulling it back afterwards comes too late to help.
  const [at, setAt] = useState<{
    right: number;
    top: number;
    inside: boolean;
  } | null>(null);

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (label === null || !el) {
      setAt(null);
      return;
    }
    const measure = () => {
      const r = el.getBoundingClientRect();
      // Straddling the edge would take it off-screen: drop it inside instead.
      const inside = r.top - HALF_HEIGHT_PX < 0;
      setAt({
        right: Math.max(window.innerWidth - r.right + INSET_PX, 0),
        top: inside ? r.top + 4 : r.top,
        inside,
      });
    };
    measure();
    // The tape scrolls under the label while it is up, and the row's box
    // moves whenever the tape is resized — so follow the anchor rather than
    // freezing where it was when the copy landed.
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [label, anchorRef]);

  if (label === null || at === null) return null;

  return createPortal(
    <span
      role="status"
      style={{ right: `${at.right}px`, top: `${at.top}px` }}
      className={`pointer-events-none fixed z-[70] rounded-md bg-accent px-2 py-0.5 text-xs font-medium whitespace-nowrap text-page-bg shadow-md ${
        at.inside ? "" : "-translate-y-1/2"
      }`}
    >
      {label}
    </span>,
    document.body,
  );
}
