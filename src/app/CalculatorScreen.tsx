// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The calculator surface, Calcbot-style: the session tape rests above a tall
// display that shows the expression being typed with a live result preview,
// and the active mode's keypad sits below. The tape always keeps a slice of
// the screen — the last few entries stay in view — and expands to half the
// screen (scrolling either way) via the handle or a swipe down on the
// display. Pressing `=` logs an entry to the tape. Programmer-flavoured modes
// add a hex spelling of the preview.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  ChevronDownIcon,
  ChevronUpIcon,
} from "@niclaslindstedt/oss-framework/components";

import { chainExpression } from "./chain.ts";
import { evaluate, EvalError, formatHex, formatResult } from "./evaluator.ts";
import { HistoryEntryRow } from "./HistoryEntryRow.tsx";
import { Keypad } from "./Keypad.tsx";
import type { KeyDef, Mode } from "./modes.ts";
import type { Session } from "./session.ts";
import type { KeyTextSize } from "./useAppSettings.ts";

type Props = {
  session: Session;
  mode: Mode;
  hiddenKeys: readonly string[];
  historyOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
  swipeDownHistory: boolean;
  keyFeedback: boolean;
  keyTextSize: KeyTextSize;
  onLogEntry: (expression: string, result: string, chained: boolean) => void;
  onNoteEntry: (entryId: string, note: string) => void;
  onStarEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  // Asked for by a long press on `C` with nothing left to erase. The screen
  // only requests it — App owns the confirmation.
  onClearHistory: () => void;
};

// How far a downward drag on the display must travel to latch the tape open.
const REVEAL_AT = 56;

// True when `expression` still uses `seed` (the result `=` handed over) as a
// value rather than having edited it away: typing more digits onto the seed
// grows the number instead of operating on it, and backspacing into it breaks
// the link entirely. See chain.ts for what the link buys.
function continuesFrom(expression: string, seed: string): boolean {
  if (!expression.startsWith(seed)) return false;
  const rest = expression.slice(seed.length);
  return rest === "" || !/^[0-9a-fA-F.xX]/.test(rest);
}

export function CalculatorScreen({
  session,
  mode,
  hiddenKeys,
  historyOpen,
  onHistoryOpenChange,
  swipeDownHistory,
  keyFeedback,
  keyTextSize,
  onLogEntry,
  onNoteEntry,
  onStarEntry,
  onDeleteEntry,
  onClearHistory,
}: Props) {
  const [expression, setExpression] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The result `=` seeded the current expression with — non-null exactly
  // while the next `=` would extend the chain rather than start a new one.
  const [chainFrom, setChainFrom] = useState<string | null>(null);
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

  // The folded-up expression behind each chained entry, by entry id — what
  // the tape's "Copy chain" action puts on the clipboard.
  const chains = useMemo(() => {
    const byId = new Map<string, string>();
    session.entries.forEach((entry, index) => {
      const chain = chainExpression(session.entries, index);
      if (chain) byId.set(entry.id, chain);
    });
    return byId;
  }, [session.entries]);

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
    setChainFrom(null);
  }, []);

  const backspace = useCallback(() => {
    setError(null);
    setExpression((prev) => prev.slice(0, -1));
  }, []);

  // Any edit that walks off the seeded result ends the chain — the run of
  // calculations only holds while each step builds on the last one's value.
  useEffect(() => {
    if (chainFrom !== null && !continuesFrom(expression, chainFrom)) {
      setChainFrom(null);
    }
  }, [expression, chainFrom]);

  const equals = useCallback(() => {
    const expr = expression.trim();
    if (!expr) return;
    try {
      const result = formatResult(evaluate(expr));
      onLogEntry(
        expr,
        result,
        chainFrom !== null && continuesFrom(expr, chainFrom),
      );
      // Chain: the result becomes the start of the next expression.
      setExpression(result);
      setChainFrom(result);
      setError(null);
    } catch (err) {
      setError(err instanceof EvalError ? err.message : "error");
    }
  }, [expression, chainFrom, onLogEntry]);

  // The erase key reads the display. With characters on it a tap takes one
  // back and a hold takes them all; with the display empty there is nothing
  // to erase, so the tap does nothing and the hold offers the tape instead.
  const onKey = useCallback(
    (key: KeyDef) => {
      if (key.action === "clear") {
        if (expression) backspace();
      } else if (key.action === "equals") equals();
      else if (key.input) append(key.input);
    },
    [expression, backspace, equals, append],
  );

  const onKeyLongPress = useCallback(
    (key: KeyDef) => {
      if (key.action !== "clear") return;
      if (expression) clear();
      else onClearHistory();
    },
    [expression, clear, onClearHistory],
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

  // Keep the tape pinned to its newest entry — it is always in view now, so
  // this runs whether or not it is expanded.
  useEffect(() => {
    tapeEndRef.current?.scrollIntoView({ block: "end" });
  }, [historyOpen, session.entries.length]);

  // Swipe down on the display to expand the tape (and up to collapse it).
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
      {/* Tape. Collapsed it sizes to its content but stops at roughly four
          entries (and never takes more than a third of a short screen), so the
          recent run is always readable without hiding the keys; expanded it
          claims half the screen. It scrolls either way. */}
      <div
        className={`flex min-h-0 shrink flex-col overflow-y-auto bg-surface transition-[flex-basis,max-height] duration-200 ${
          historyOpen ? "grow basis-1/2" : "basis-auto max-h-[min(17rem,35svh)]"
        }`}
        aria-label="Session history"
      >
        {/* `mt-auto` keeps a short tape resting on the display, newest entry
            nearest the keys — the receipt grows down out of the top. */}
        <div className="mt-auto">
          {session.entries.length === 0 ? (
            <p className="px-4 py-4 text-center text-xs text-muted">
              No entries
            </p>
          ) : (
            session.entries.map((entry) => (
              <HistoryEntryRow
                key={entry.id}
                entry={entry}
                chain={chains.get(entry.id) ?? null}
                onNote={onNoteEntry}
                onStar={onStarEntry}
                onDelete={onDeleteEntry}
              />
            ))
          )}
          <div ref={tapeEndRef} />
        </div>
      </div>

      {/* Expand handle. The framework glyphs carry no intrinsic size — without
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
          ? "Collapse history"
          : `Expand history${session.entries.length ? ` (${session.entries.length})` : ""}`}
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
        textSize={keyTextSize}
        clearIsBackspace={expression.length > 0}
        onKey={onKey}
        onKeyLongPress={onKeyLongPress}
      />
    </div>
  );
}
