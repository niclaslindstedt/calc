// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// One tape entry, Calcbot-shaped: the result reads large on the right with
// the expression it came from set small underneath, and a note button sits in
// the left gutter (where Calcbot keeps its favourite star — notes are this
// app's version of that gesture).
//
// Interactions (the app's core gesture contract):
//   - tap        → copy the result value
//   - long press → copy the whole expression
//   - note gutter / left swipe → edit the note inline below
// A saved note renders under the calculation in muted text, so the tape reads
// like the markdown file it round-trips to.

import { useRef, useState } from "react";

import {
  NoteIcon,
  SwipeableRow,
  TrashIcon,
} from "@niclaslindstedt/oss-framework/components";
import {
  copyTextToClipboard,
  useLongPress,
} from "@niclaslindstedt/oss-framework/hooks";

import type { Entry } from "./session.ts";

type Props = {
  entry: Entry;
  onNote: (entryId: string, note: string) => void;
  onDelete: (entryId: string) => void;
  onCopied: (what: "value" | "expression") => void;
};

export function HistoryEntryRow({ entry, onNote, onDelete, onCopied }: Props) {
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState(entry.note ?? "");
  const noteRef = useRef<HTMLTextAreaElement>(null);
  const longPressed = useRef(false);

  const longPress = useLongPress(() => {
    longPressed.current = true;
    void copyTextToClipboard(entry.expression).then((ok) => {
      if (ok) onCopied("expression");
    });
  });

  const copyValue = () => {
    // The click that trails a long press must not also copy the value.
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    void copyTextToClipboard(entry.result).then((ok) => {
      if (ok) onCopied("value");
    });
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
    <div className="border-b border-line">
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
              entry.note ? "text-accent" : "text-muted"
            }`}
            aria-label={entry.note ? "Edit note" : "Add note"}
            title={entry.note ? "Edit note" : "Add note"}
            onClick={openNote}
          >
            <NoteIcon className="h-5 w-5" />
          </button>
          <button
            type="button"
            className="min-w-0 grow py-2 text-right [touch-action:pan-y]"
            onClick={copyValue}
            title="Tap to copy the value, long-press to copy the expression"
            {...longPress}
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
