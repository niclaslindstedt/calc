// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// One tape entry. Interactions (the app's core gesture contract):
//   - tap        → copy the result value
//   - long press → copy the whole expression
//   - left swipe → reveal the note action; the note is edited inline below
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

  return (
    <div className="border-b border-line">
      <SwipeableRow
        trailing={{
          kind: "reveal",
          buttons: [
            {
              label: entry.note ? "Edit note" : "Add note",
              icon: <NoteIcon />,
              onSelect: () => {
                setDraft(entry.note ?? "");
                setEditingNote(true);
                window.setTimeout(() => noteRef.current?.focus(), 0);
              },
            },
            {
              label: "Delete entry",
              icon: <TrashIcon />,
              danger: true,
              onSelect: () => onDelete(entry.id),
            },
          ],
        }}
      >
        <button
          type="button"
          className="flex w-full items-baseline justify-between gap-3 bg-surface px-4 py-2 text-left [touch-action:pan-y]"
          onClick={copyValue}
          title="Tap to copy the value, long-press to copy the expression"
          {...longPress}
        >
          <span className="min-w-0 truncate font-mono text-sm text-muted">
            {entry.expression}
          </span>
          <span className="shrink-0 font-mono text-base text-fg-bright">
            = {entry.result}
          </span>
        </button>
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
          className="block w-full px-4 pb-2 text-left text-xs text-muted"
          onClick={() => {
            setDraft(entry.note ?? "");
            setEditingNote(true);
            window.setTimeout(() => noteRef.current?.focus(), 0);
          }}
        >
          {entry.note}
        </button>
      ) : null}
    </div>
  );
}
