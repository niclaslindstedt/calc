// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The sidebar's two collapse rails, ported from the notes sibling.
//
// `SidebarCollapseRail` rides the inner edge of the docked sidebar and folds
// the whole panel away; `FooterCollapseRail` sits just above the sidebar's
// footer and folds that away, handing the freed rows to the session list.
// Both are chevron-only controls that read as part of the panel's chrome
// rather than as buttons competing with its content.

import {
  ChevronDownIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  ChevronUpIcon,
} from "@niclaslindstedt/oss-framework/components";
import type { RefObject } from "react";

/** The docked sidebar panel's own width (the framework's `w-64`). */
export const SIDEBAR_PANEL_WIDTH = "16rem";
/**
 * The width of the collapse rail that reveals itself on the panel's inner
 * edge (`w-4`). Wide enough to hover and press without a precise aim, narrow
 * enough to read as a grip on the divider rather than a second panel. It is an
 * overlay, so it is never part of the sidebar's footprint.
 */
export const SIDEBAR_RAIL_WIDTH = "1rem";

// The thin chevron rail seated just above the footer. A full-width button one
// line tall: tapping it folds the footer away to give the session list more
// room, and again to bring it back. The chevron points down to collapse (fold
// the footer out of view) and up to restore it. Folded, the rail is the last
// thing in the panel, so `last` hands it the bottom inset the footer was
// carrying rather than leaving a band of dead space under it.
export function FooterCollapseRail({
  collapsed,
  last = false,
  label,
  onClick,
}: {
  collapsed: boolean;
  /**
   * The rail is the panel's last child (the footer is folded away), so it owns
   * the bottom breathing room the footer would otherwise carry — including the
   * home-indicator inset, which calc's shell paints under.
   */
  last?: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      className={`flex w-full shrink-0 cursor-pointer items-center justify-center border-t border-line pt-[calc(var(--density-row-py)+0.25rem)] text-muted hover:bg-surface-2 hover:text-fg-bright ${
        last
          ? "pb-[max(calc(var(--density-row-py)+0.25rem),env(safe-area-inset-bottom))]"
          : "pb-[calc(var(--density-row-py)+0.25rem)]"
      }`}
    >
      {collapsed ? (
        <ChevronUpIcon className="h-4 w-4" />
      ) : (
        <ChevronDownIcon className="h-4 w-4" />
      )}
    </button>
  );
}

// The vertical twin of `FooterCollapseRail`: the control seated on the *inner*
// edge of the docked sidebar (the edge that faces the calculator), which folds
// the whole panel away and brings it back. Only the docked layout has one —
// the phone drawer closes instead of collapsing.
//
// It costs the layout nothing, and at rest it costs the *pointer* nothing
// either. Two nested pieces do that:
//
// - The `<button>` itself is a full-height, invisible sensor straddling the
//   edge, and is `pointer-events-none` for its whole life. `useEdgeHover`
//   measures its box against the cursor to decide `revealed` — which is why it
//   can be click-through and still know when it's being approached, something
//   plain `:hover` can't do.
// - The grip inside it is the only thing ever drawn or pressed, and only once
//   `revealed` turns its opacity and its pointer events back on together. A
//   descendant may take pointer events back from a `none` ancestor, and the
//   press still bubbles to the button's handler.
//
// The grip fills the sensor: a `w-4` strip running the panel's whole height,
// so wherever along the edge the pointer arrives it is already on the control
// rather than hunting up or down for a small handle.
//
// Running that tall, it has to be quiet: no border and no shadow — just a flat
// `surface-3` strip over the divider, with the chevron muted at its centre.
// The fill is opaque rather than a translucent wash so the strip reads as one
// solid control at any panel width, over any theme, instead of picking up
// whatever it happens to sit on. Hovering it directly fills it with
// `surface-2` — the tone the panel's own rows take on hover — and brightens
// the chevron, which is the moment it has to read unmistakably as a button.
// The chevron points the way the panel will move (out toward the edge to
// collapse, in toward the calculator to restore). `title` keeps it
// discoverable for a pointer that pauses there; keyboard focus reveals it on
// its own terms (a focused button takes Enter without needing pointer events
// at all), and `aria-expanded` keeps it legible to a screen reader either way.
export function SidebarCollapseRail({
  collapsed,
  side,
  label,
  offset,
  revealed,
  elementRef,
  onClick,
}: {
  /** Whether the sidebar is currently folded away. */
  collapsed: boolean;
  /** Which edge of the viewport the sidebar docks on. */
  side: "left" | "right";
  /** Accessible name / tooltip — "Hide sidebar" or "Show sidebar". */
  label: string;
  /** How far in from `side` the sensor's band starts, as a CSS length. */
  offset: string;
  /**
   * Whether the grip is currently drawn and pressable — the two go together,
   * so an invisible grip can never swallow a press (see `useEdgeHover`).
   */
  revealed: boolean;
  /** Measured by `useEdgeHover` to decide `revealed`. Not a renderer `ref`. */
  elementRef?: RefObject<HTMLButtonElement>;
  onClick: () => void;
}) {
  // Collapsed on the left edge, the way back in is rightward; docked on the
  // right, every direction mirrors.
  const pointsRight = side === "left" ? collapsed : !collapsed;
  return (
    <button
      ref={elementRef}
      type="button"
      onClick={(e) => {
        // A pressed rail keeps focus, and the first key typed afterwards
        // promotes that focus to `:focus-visible` — which lit the rail's ring
        // down the whole edge of the screen every time a digit was typed at
        // the calculator. `detail > 0` is a genuine pointer press (keyboard
        // activation reports 0), so the ring still belongs to anyone who
        // tabbed here.
        if (e.detail > 0) e.currentTarget.blur();
        onClick();
      }}
      aria-label={label}
      aria-expanded={!collapsed}
      title={label}
      style={{ [side]: offset }}
      className="group pointer-events-none absolute inset-y-0 z-40 flex w-4 items-center justify-center focus-visible:outline-none"
    >
      <span
        className={`flex h-full w-full items-center justify-center text-muted transition-[opacity,background-color,color] duration-150 group-focus-visible:bg-surface-2 group-focus-visible:text-fg-bright group-focus-visible:opacity-100 group-focus-visible:ring-2 group-focus-visible:ring-accent group-focus-visible:ring-inset motion-reduce:transition-none ${
          revealed
            ? "pointer-events-auto cursor-pointer bg-surface-3 opacity-100 hover:bg-surface-2 hover:text-fg-bright"
            : "opacity-0"
        }`}
      >
        {pointsRight ? (
          <ChevronRightIcon className="h-4 w-4" />
        ) : (
          <ChevronLeftIcon className="h-4 w-4" />
        )}
      </span>
    </button>
  );
}
