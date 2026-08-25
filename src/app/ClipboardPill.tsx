// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The floating clipboard bar a long press on the display raises: one rounded
// pill hovering over the expression, split into a **copy** half and a
// **paste** half. It is the notes sibling's select-mode cut/delete bar
// (`src/ui/SelectActionPill.tsx`) in this app's colours — same seam, same
// portal, same reasons.
//
// It exists because the display was the one number in the app with no way in
// or out. The tape has copy on a tap and a long press, but the expression
// being typed could only be retyped somewhere else, and a figure copied from
// a receipt or a spreadsheet could only be read off the other screen and
// keyed in digit by digit. So the two clipboard verbs come to the display,
// on the gesture the tape already trained: press and hold.
//
// The pill is **portalled to `document.body`** rather than left in the
// display: the app shell clips its own overflow and the keypad below it
// paints over anything that leaks out, so a bar nested in the display would
// be cut off at exactly the edges it has to hover over. Being out of the tree
// also means a press on it cannot reach the display's own swipe handler
// underneath, which would otherwise read the press as a drag on the tape.
//
// It is centred on the **measured** box of the display rather than on
// `left: 50%` of the window, because the pinned sidebar offsets the app's
// column sideways on a tablet and a hard-coded centre drifts into it.

import { useLayoutEffect, useState, type RefObject } from "react";
import { createPortal } from "react-dom";

import {
  CopyIcon,
  DismissBackdrop,
} from "@niclaslindstedt/oss-framework/components";
import { useEscapeKey } from "@niclaslindstedt/oss-framework/hooks";

import { PasteIcon } from "./icons.tsx";

/** How far below the top of the display the bar hovers. */
const PILL_GAP_PX = 12;

export function ClipboardPill({
  open,
  anchorRef,
  copyLabel,
  pasteLabel,
  onCopy,
  onPaste,
  onDismiss,
}: {
  /** The gesture has landed, so the bar has work to do. Drives the fade
   *  rather than the mount, so it slides away instead of vanishing. */
  open: boolean;
  /** The display — the box the bar centres on and hangs under. */
  anchorRef: RefObject<HTMLElement | null>;
  /** What the copy half would take, or null when the display is empty. */
  copyLabel: string | null;
  /** What the paste half would add, or null when the clipboard holds nothing
   *  the display can take (see paste.ts). */
  pasteLabel: string | null;
  onCopy: () => void;
  onPaste: () => void;
  onDismiss: () => void;
}) {
  const [at, setAt] = useState<{ x: number; y: number } | null>(null);

  useEscapeKey(open, onDismiss);

  useLayoutEffect(() => {
    const el = anchorRef.current;
    if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      setAt({ x: r.left + r.width / 2, y: r.top + PILL_GAP_PX });
    };
    measure();
    // The display's box moves for reasons `resize` never fires on — the tape
    // expanding above it, a mode with a taller keypad below — so watch the
    // element itself as well as the window. `visualViewport` is the third: a
    // soft keyboard shrinks the visual viewport without resizing the layout.
    const observer =
      typeof ResizeObserver === "function" ? new ResizeObserver(measure) : null;
    observer?.observe(el);
    const vv = window.visualViewport;
    window.addEventListener("resize", measure);
    vv?.addEventListener("resize", measure);
    vv?.addEventListener("scroll", measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", measure);
      vv?.removeEventListener("resize", measure);
      vv?.removeEventListener("scroll", measure);
    };
    // `open` is a dependency so the bar re-measures as it appears: the tape
    // may have been expanded or collapsed while it was away.
  }, [anchorRef, open]);

  return (
    <>
      {/* The next press anywhere else puts the bar away — the gesture is
          transient, and the keypad underneath must not act on the press that
          dismisses it. */}
      {open ? <DismissBackdrop onDismiss={onDismiss} /> : null}
      {createPortal(
        <div
          role="group"
          aria-label="Clipboard"
          aria-hidden={!open}
          style={at ? { left: `${at.x}px`, top: `${at.y}px` } : undefined}
          // A hairline `gap-px` over the bar's own translucent backdrop is
          // what separates the two halves — they read as one pill with a seam
          // rather than as two buttons that happen to touch.
          className={`fixed z-[60] flex -translate-x-1/2 touch-none items-center gap-px overflow-hidden rounded-full bg-page-bg/40 shadow-lg transition-all duration-200 select-none ${
            at ? "" : "left-1/2"
          } ${open ? "scale-100 opacity-100" : "pointer-events-none scale-90 opacity-0"}`}
        >
          <button
            type="button"
            disabled={!open || copyLabel === null}
            onClick={onCopy}
            aria-label={copyLabel ? `Copy ${copyLabel}` : "Copy"}
            title={copyLabel ? `Copy ${copyLabel}` : "Nothing on the display"}
            className="flex cursor-pointer items-center gap-2 bg-link px-6 py-3 text-sm font-medium text-page-bg transition-[filter] active:brightness-90 disabled:opacity-40"
          >
            <CopyIcon className="h-5 w-5 shrink-0" />
            Copy
          </button>
          <button
            type="button"
            disabled={!open || pasteLabel === null}
            onClick={onPaste}
            // The label names what would actually land on the display: a
            // number salvaged out of prose is not what the user copied, and
            // saying so is the difference between a paste and a surprise.
            aria-label={pasteLabel ? `Paste ${pasteLabel}` : "Paste"}
            title={
              pasteLabel ? `Paste ${pasteLabel}` : "Nothing to paste from here"
            }
            className="flex cursor-pointer items-center gap-2 bg-accent px-6 py-3 text-sm font-medium text-page-bg transition-[filter] active:brightness-90 disabled:opacity-40"
          >
            <PasteIcon className="h-5 w-5 shrink-0" />
            <span className="max-w-40 truncate">
              {pasteLabel ? `Paste ${pasteLabel}` : "Paste"}
            </span>
          </button>
        </div>,
        document.body,
      )}
    </>
  );
}
