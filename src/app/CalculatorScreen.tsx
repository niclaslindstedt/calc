// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The calculator surface, Calcbot-style: a tall display that shows the
// expression being typed with a live result preview, the active mode's
// keypad below, and the session tape hidden above the display — revealed by
// swiping down on the display (or the history toggle). Pressing `=` logs an
// entry to the tape. Programmer-flavoured modes add a hex spelling of the
// preview.

import { useCallback, useEffect, useRef, useState } from "react";

import {
  ChevronDownIcon,
  ChevronUpIcon,
} from "@niclaslindstedt/oss-framework/components";

import { evaluate, EvalError, formatHex, formatResult } from "./evaluator.ts";
import { HistoryEntryRow } from "./HistoryEntryRow.tsx";
import { Keypad } from "./Keypad.tsx";
import type { KeyDef, Mode } from "./modes.ts";
import type { Session } from "./session.ts";

type Props = {
  session: Session;
  mode: Mode;
  hiddenKeys: readonly string[];
  historyOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
  swipeDownHistory: boolean;
  keyFeedback: boolean;
  onLogEntry: (expression: string, result: string) => void;
  onNoteEntry: (entryId: string, note: string) => void;
  onDeleteEntry: (entryId: string) => void;
  onCopied: (what: "value" | "expression") => void;
};

// How far a downward drag on the display must travel to latch the tape open.
const REVEAL_AT = 56;

export function CalculatorScreen({
  session,
  mode,
  hiddenKeys,
  historyOpen,
  onHistoryOpenChange,
  swipeDownHistory,
  keyFeedback,
  onLogEntry,
  onNoteEntry,
  onDeleteEntry,
  onCopied,
}: Props) {
  const [expression, setExpression] = useState("");
  const [error, setError] = useState<string | null>(null);
  const tapeEndRef = useRef<HTMLDivElement>(null);

  // Live preview: evaluate as the user types; errors stay silent until `=`.
  let preview: string | null = null;
  if (expression.trim()) {
    try {
      preview = formatResult(evaluate(expression));
    } catch {
      preview = null;
    }
  }
  const hexPreview =
    mode.hexPreview && preview !== null
      ? formatHex(Number.parseFloat(preview))
      : null;

  const append = useCallback((text: string) => {
    setError(null);
    if (text === "()") {
      // Smart paren: close when there's an unclosed one and the last
      // character can end an expression; open otherwise.
      setExpression((prev) => {
        const opens = (prev.match(/\(/g) ?? []).length;
        const closes = (prev.match(/\)/g) ?? []).length;
        const closable = opens > closes && /[0-9.)!]$/.test(prev);
        return prev + (closable ? ")" : "(");
      });
      return;
    }
    setExpression((prev) => prev + text);
  }, []);

  const clear = useCallback(() => {
    setError(null);
    setExpression("");
  }, []);

  const backspace = useCallback(() => {
    setError(null);
    setExpression((prev) => prev.slice(0, -1));
  }, []);

  const equals = useCallback(() => {
    const expr = expression.trim();
    if (!expr) return;
    try {
      const result = formatResult(evaluate(expr));
      onLogEntry(expr, result);
      // Chain: the result becomes the start of the next expression.
      setExpression(result);
      setError(null);
    } catch (err) {
      setError(err instanceof EvalError ? err.message : "error");
    }
  }, [expression, onLogEntry]);

  const onKey = useCallback(
    (key: KeyDef) => {
      if (key.action === "clear") clear();
      else if (key.action === "backspace") backspace();
      else if (key.action === "equals") equals();
      else if (key.input) append(key.input);
    },
    [clear, backspace, equals, append],
  );

  // Hardware keyboard support.
  useEffect(() => {
    const onKeydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (/^[0-9a-fA-Fx.+\-*/%^()!&|~<>]$/.test(e.key)) {
        append(e.key);
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === "=") {
        equals();
        e.preventDefault();
      } else if (e.key === "Backspace") {
        backspace();
      } else if (e.key === "Escape") {
        clear();
      }
    };
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, [append, equals, backspace, clear]);

  // Keep the tape pinned to its newest entry.
  useEffect(() => {
    if (historyOpen) {
      tapeEndRef.current?.scrollIntoView({ block: "end" });
    }
  }, [historyOpen, session.entries.length]);

  // Swipe down on the display to reveal the tape (and up to hide it).
  const drag = useRef<{ y: number; active: boolean }>({ y: 0, active: false });
  const onDisplayPointerDown = (e: { clientY: number }) => {
    if (!swipeDownHistory) return;
    drag.current = { y: e.clientY, active: true };
  };
  const onDisplayPointerUp = (e: { clientY: number }) => {
    if (!drag.current.active) return;
    const dy = e.clientY - drag.current.y;
    drag.current.active = false;
    if (dy > REVEAL_AT) onHistoryOpenChange(true);
    else if (dy < -REVEAL_AT) onHistoryOpenChange(false);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* Tape — collapsed until revealed */}
      <div
        className={`flex min-h-0 shrink flex-col overflow-y-auto bg-surface transition-[flex-basis] ${
          historyOpen ? "grow basis-1/2" : "basis-0"
        }`}
        aria-label="Session history"
        aria-hidden={!historyOpen}
      >
        {/* `mt-auto` keeps a short tape resting on the display, newest entry
            nearest the keys — the receipt grows down out of the top. */}
        <div className="mt-auto">
          {session.entries.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-muted">
              Calculations that end with = land here.
            </p>
          ) : (
            session.entries.map((entry) => (
              <HistoryEntryRow
                key={entry.id}
                entry={entry}
                onNote={onNoteEntry}
                onDelete={onDeleteEntry}
                onCopied={onCopied}
              />
            ))
          )}
          <div ref={tapeEndRef} />
        </div>
      </div>

      {/* Reveal handle. The framework glyphs carry no intrinsic size — without
          an explicit box they stretch to fill this flex row and swallow the
          screen, so every icon here is sized. */}
      <button
        type="button"
        className="flex shrink-0 items-center justify-center gap-1.5 border-y border-line bg-surface py-1.5 text-xs text-muted"
        onClick={() => onHistoryOpenChange(!historyOpen)}
        aria-expanded={historyOpen}
      >
        {historyOpen ? (
          <ChevronUpIcon className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronDownIcon className="h-3.5 w-3.5 shrink-0" />
        )}
        {historyOpen
          ? "Hide history"
          : `History${session.entries.length ? ` (${session.entries.length})` : ""}`}
      </button>

      {/* Display */}
      <div
        className="flex min-h-[5.5rem] shrink grow basis-0 flex-col items-end justify-end gap-1 overflow-hidden px-5 py-4 [touch-action:pan-x]"
        onPointerDown={onDisplayPointerDown}
        onPointerUp={onDisplayPointerUp}
      >
        <output
          className="w-full break-all text-right font-mono text-3xl leading-tight text-fg-bright"
          aria-live="polite"
        >
          {expression || "0"}
        </output>
        <div className="min-h-6 text-right font-mono text-base text-muted">
          {error ? (
            <span className="text-danger">{error}</span>
          ) : preview !== null && preview !== expression ? (
            <span>
              = {preview}
              {hexPreview ? (
                <span className="ml-3 text-sm">{hexPreview}</span>
              ) : null}
            </span>
          ) : hexPreview && preview === expression ? (
            <span className="text-sm">{hexPreview}</span>
          ) : null}
        </div>
      </div>

      {/* Keypad — the active mode's layout minus the user's hidden keys */}
      <Keypad
        mode={mode}
        hidden={hiddenKeys}
        keyFeedback={keyFeedback}
        onKey={onKey}
        onBackspaceAlt={backspace}
      />
    </div>
  );
}
