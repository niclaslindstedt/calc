// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// One tape entry, Calcbot-shaped: the result reads large on the right with
// the expression it came from set small underneath, and a star sits in the
// left gutter (Calcbot's favourite gesture — here it just highlights the rows
// that matter in a long session).
//
// Interactions (the app's core gesture contract):
//   - tap         → copy the result value
//   - long press  → copy the expression; on a row that continued from the one
//                   above, a menu offers its own expression or the whole
//                   folded-up chain (see chain.ts)
//   - star gutter → flag the row as important
//   - left swipe  → note / delete actions
//   - right-click → the same note / delete actions, as a menu. A desktop
//                   pointer has no swipe in it, so the row's actions have to
//                   arrive on the gesture a desktop *does* have.
// Every copy confirms in place: a small label flicks up over the value it
// copied, so the eye never leaves the number it just took (CopiedFlash.tsx).
// A saved note renders under the calculation in muted text, so the tape reads
// like the markdown file it round-trips to.

import { useEffect, useRef, useState } from "react";

import {
  ContextMenu,
  CopyIcon,
  NoteIcon,
  StarIcon,
  SwipeableRow,
  TrashIcon,
  type FloatingPoint,
  type RowAction,
} from "@niclaslindstedt/oss-framework/components";
import {
  copyTextToClipboard,
  useLongPress,
} from "@niclaslindstedt/oss-framework/hooks";

import { CopiedFlash } from "./CopiedFlash.tsx";
import { ExpressionText } from "./ExpressionText.tsx";
import type { Entry } from "./session.ts";

type Props = {
  entry: Entry;
  // The whole run of calculations this entry ends, folded into one
  // expression — null when the entry starts its own run.
  chain: string | null;
  // Lit because `=` was pressed again on a calculation this entry already
  // records — the tape points back at it rather than growing a twin of it
  // (CalculatorScreen.tsx).
  highlighted?: boolean;
  onNote: (entryId: string, note: string) => void;
  onStar: (entryId: string) => void;
  onDelete: (entryId: string) => void;
};

// What a copy confirmation says, keyed by what went to the clipboard.
const COPIED_LABEL = {
  value: "Value copied",
  expression: "Expression copied",
  chain: "Chain copied",
} as const;

type Copied = keyof typeof COPIED_LABEL;

// The two menus a row can raise. `copy` is the long press's choice between an
// entry's own expression and the chain behind it; `row` is the right-click
// twin of the swipe-left actions.
type MenuKind = "copy" | "row";

// How long the in-place copy confirmation stays up. Long enough to read two
// words, short enough that it never sits between the user and the next tap.
const COPIED_MS = 1200;

export function HistoryEntryRow({
  entry,
  chain,
  highlighted = false,
  onNote,
  onStar,
  onDelete,
}: Props) {
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState(entry.note ?? "");
  // The in-place confirmation over the value — null when nothing was copied.
  const [copied, setCopied] = useState<Copied | null>(null);
  // Where a menu was asked for, and which one. Null while none is open.
  const [menu, setMenu] = useState<{
    at: FloatingPoint;
    kind: MenuKind;
  } | null>(null);
  const rowRef = useRef<HTMLDivElement>(null);
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const longPressed = useRef(false);
  const pointer = useRef<FloatingPoint>({ x: 0, y: 0 });
  const copiedTimer = useRef<number | undefined>(undefined);

  // Clearing the confirmation is a timer, so it must not outlive the row.
  useEffect(
    () => () => {
      window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  const copy = (what: Copied, text: string) => {
    void copyTextToClipboard(text).then((ok) => {
      if (!ok) return;
      setCopied(what);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
    });
  };

  const longPress = useLongPress(() => {
    longPressed.current = true;
    // With a chain behind it the press is a choice, not an action — the menu
    // opens where the finger is. Without one there is only one thing to copy.
    if (chain) setMenu({ at: { ...pointer.current }, kind: "copy" });
    else copy("expression", entry.expression);
  });

  const copyValue = () => {
    // The click that trails a long press must not also copy the value.
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    copy("value", entry.result);
  };

  const commitNote = () => {
    setEditingNote(false);
    if (draft.trim() !== (entry.note ?? "")) onNote(entry.id, draft);
  };

  const openNote = () => {
    setDraft(entry.note ?? "");
    setEditingNote(true);
    window.setTimeout(() => noteRef.current?.focus(), 0);
  };

  // One list, two doors: the swipe strip and the right-click menu offer the
  // row's actions in the same order and wording, so the desktop gesture is
  // the phone one rather than a second vocabulary.
  const rowActions: RowAction[] = [
    {
      label: entry.note ? "Edit note" : "Add note",
      icon: <NoteIcon className="h-4 w-4" />,
      onSelect: openNote,
    },
    {
      label: "Delete entry",
      icon: <TrashIcon className="h-4 w-4" />,
      danger: true,
      onSelect: () => onDelete(entry.id),
    },
  ];

  const copyActions: RowAction[] = [
    {
      label: "Copy expression",
      icon: <CopyIcon className="h-4 w-4" />,
      onSelect: () => copy("expression", entry.expression),
    },
    {
      label: "Copy chain",
      icon: <CopyIcon className="h-4 w-4" />,
      onSelect: () => {
        if (chain) copy("chain", chain);
      },
    },
  ];

  return (
    <div
      ref={rowRef}
      className="relative border-b border-line"
      onContextMenu={(e) => {
        // The row owns the right button: the platform menu has nothing to
        // offer over a readout that cannot be selected anyway.
        e.preventDefault();
        setMenu({ at: { x: e.clientX, y: e.clientY }, kind: "row" });
      }}
    >
      <CopiedFlash
        label={copied ? COPIED_LABEL[copied] : null}
        anchorRef={rowRef}
      />
      {/* `highlighted` paints the framework's tint-and-ring overlay above the
          row's own opaque surface — what a repeated `=` lights instead of
          appending a twin of this entry. */}
      <SwipeableRow
        trailing={{ kind: "reveal", buttons: rowActions }}
        highlighted={highlighted}
      >
        {/* The row is one big copy button with a star in its gutter, so it
            answers the pointer as such: the whole strip lifts to `surface-2`
            on hover and both targets take the pressable cursor. */}
        <div className="flex items-center gap-2 bg-surface pr-4 pl-2 transition-colors hover:bg-surface-2">
          <button
            type="button"
            className={`shrink-0 rounded-lg p-2 hover:bg-surface-3 ${
              entry.starred ? "text-accent" : "text-muted hover:text-fg-bright"
            }`}
            aria-label={entry.starred ? "Unstar entry" : "Star entry"}
            aria-pressed={Boolean(entry.starred)}
            title={entry.starred ? "Unstar entry" : "Star entry"}
            onClick={() => onStar(entry.id)}
          >
            <StarIcon className="h-5 w-5" filled={Boolean(entry.starred)} />
          </button>
          <button
            type="button"
            className="min-w-0 grow py-2 text-right [touch-action:pan-y]"
            onClick={copyValue}
            title={
              chain
                ? "Tap to copy the value, long-press to copy the expression or the chain"
                : "Tap to copy the value, long-press to copy the expression"
            }
            {...longPress}
            onPointerDown={(e) => {
              // The menu opens under the finger, so remember where it went
              // down — `useLongPress` reports the press, not its position.
              pointer.current = { x: e.clientX, y: e.clientY };
              longPress.onPointerDown(e);
            }}
          >
            <span className="block truncate font-mono text-2xl leading-tight text-fg-bright">
              {entry.result}
            </span>
            <ExpressionText
              text={entry.expression}
              className="calc-expression-soft block truncate font-mono text-sm text-muted"
            />
          </button>
        </div>
      </SwipeableRow>
      <ContextMenu
        position={menu?.at ?? null}
        onClose={() => setMenu(null)}
        ariaLabel={
          menu?.kind === "copy" ? "Copy this calculation" : "Entry actions"
        }
        actions={menu?.kind === "copy" ? copyActions : rowActions}
      />
      {editingNote ? (
        <textarea
          ref={noteRef}
          rows={2}
          value={draft}
          placeholder="Why this calculation…"
          className="block w-full resize-none bg-surface-2 px-4 py-2 text-sm text-fg outline-none"
          onInput={(e) => setDraft(e.currentTarget.value)}
          onBlur={commitNote}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              commitNote();
            }
            if (e.key === "Escape") {
              setDraft(entry.note ?? "");
              setEditingNote(false);
            }
          }}
        />
      ) : entry.note ? (
        <button
          type="button"
          className="block w-full px-4 pb-2 text-right text-xs text-muted"
          onClick={openNote}
        >
          {entry.note}
        </button>
      ) : null}
    </div>
  );
}
