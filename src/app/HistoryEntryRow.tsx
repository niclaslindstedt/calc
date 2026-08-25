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
// Every copy confirms in place: a small label flicks up over the value it
// copied, so the eye never leaves the number it just took. A saved note
// renders under the calculation in muted text, so the tape reads like the
// markdown file it round-trips to.

import { useEffect, useRef, useState } from "react";

import {
  ContextMenu,
  CopyIcon,
  NoteIcon,
  StarIcon,
  SwipeableRow,
  TrashIcon,
  type FloatingPoint,
} from "@niclaslindstedt/oss-framework/components";
import {
  copyTextToClipboard,
  useLongPress,
} from "@niclaslindstedt/oss-framework/hooks";

import type { Entry } from "./session.ts";

type Props = {
  entry: Entry;
  // The whole run of calculations this entry ends, folded into one
  // expression — null when the entry starts its own run.
  chain: string | null;
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

// How long the in-place copy confirmation stays up. Long enough to read two
// words, short enough that it never sits between the user and the next tap.
const COPIED_MS = 1200;

export function HistoryEntryRow({
  entry,
  chain,
  onNote,
  onStar,
  onDelete,
}: Props) {
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState(entry.note ?? "");
  // The in-place confirmation over the value — null when nothing was copied.
  const [copied, setCopied] = useState<Copied | null>(null);
  // Where the long press landed, and so where the copy menu opens. Null while
  // the menu is closed.
  const [menuAt, setMenuAt] = useState<FloatingPoint | null>(null);
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
    if (chain) setMenuAt({ ...pointer.current });
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

  return (
    <div className="relative border-b border-line">
      {/* The copy confirmation rides just above the value it copied, straddling
          the row's top edge — the eye never leaves the number it just took.
          It lives outside `SwipeableRow` (which clips its own overflow while a
          swipe is armed) and is absolutely placed, so it neither reflows the
          tape nor blocks the next tap. */}
      {copied ? (
        <span
          role="status"
          className="pointer-events-none absolute top-0 right-4 z-20 -translate-y-1/2 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-page-bg shadow-md"
        >
          {COPIED_LABEL[copied]}
        </span>
      ) : null}
      <SwipeableRow
        trailing={{
          kind: "reveal",
          buttons: [
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
          ],
        }}
      >
        <div className="flex items-center gap-2 bg-surface pr-4 pl-2">
          <button
            type="button"
            className={`shrink-0 rounded-lg p-2 ${
              entry.starred ? "text-accent" : "text-muted"
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
            <span className="block truncate font-mono text-sm text-muted">
              {entry.expression}
            </span>
          </button>
        </div>
      </SwipeableRow>
      <ContextMenu
        position={menuAt}
        onClose={() => setMenuAt(null)}
        ariaLabel="Copy this calculation"
        actions={[
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
        ]}
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
