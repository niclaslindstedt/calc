// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The calculator surface, Calcbot-style: the session tape rests above a tall
// display, and the active mode's keypad sits below. The display leads with
// the running result, big, and carries the expression being typed underneath
// it — characters reveal there one at a time as they arrive (RevealText.tsx),
// operators set as chips (expression.ts), and both lines take their scale
// from Settings → Appearance → Display. Pressing `=` logs an entry to the
// tape — unless the calculation only restates the entry already at the end of
// it, which a held `=` lights instead of repeating (session.ts). Programmer-flavoured modes add a hex spelling of the result. A long
// press on the display raises the clipboard bar — copy what is on it, or
// paste what the clipboard has to offer (ClipboardPill.tsx, paste.ts).
//
// The tape and the calculator share the screen across a **draggable seam**:
// a single hairline with a grab glyph on it. Drag it and the tape takes
// whatever share of the column you leave it at — there are no steps to land
// on, so a desktop pointer can stop anywhere. Two ends are special:
//
//   - drag it (nearly) shut and the tape falls back to resting height, where
//     it sizes to its content and keeps the last few entries in view;
//   - drag it far enough that the display and the keypad no longer fit the
//     floors they set for themselves, and the tape stops sharing at all — it
//     takes the whole screen, the seam parked at the bottom to drag back up.
//
// On a phone the same two ends arrive by swipe: down on the tape opens it all
// the way, and down/up on the display steps it open and shut.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  copyTextToClipboard,
  useLongPress,
} from "@niclaslindstedt/oss-framework/hooks";

import { chainExpression } from "./chain.ts";
import { ClipboardPill } from "./ClipboardPill.tsx";
import { DISPLAY_MIN_HEIGHT, DisplayReadout } from "./DisplayReadout.tsx";
import { evaluate, EvalError, formatHex, formatResult } from "./evaluator.ts";
import { HistoryEntryRow } from "./HistoryEntryRow.tsx";
import { GrabHandleIcon } from "./icons.tsx";
import { Keypad } from "./Keypad.tsx";
import type { KeyDef, Mode } from "./modes.ts";
import { clipLabel, pasteCandidate, type PasteCandidate } from "./paste.ts";
import { repeatedEntry, type Session } from "./session.ts";
import type { DisplayTextSize, KeyTextSize } from "./useAppSettings.ts";

type Props = {
  session: Session;
  mode: Mode;
  hiddenKeys: readonly string[];
  historyOpen: boolean;
  onHistoryOpenChange: (open: boolean) => void;
  swipeDownHistory: boolean;
  keyFeedback: boolean;
  keyTextSize: KeyTextSize;
  displayTextSize: DisplayTextSize;
  onLogEntry: (expression: string, result: string, chained: boolean) => void;
  onNoteEntry: (entryId: string, note: string) => void;
  onStarEntry: (entryId: string) => void;
  onDeleteEntry: (entryId: string) => void;
  // Asked for by a long press on `C` with nothing left to erase. The screen
  // only requests it — App owns the confirmation.
  onClearHistory: () => void;
};

// Hardware keys whose glyph on the pad is not the character they type. The
// evaluator takes either spelling, so the keyboard appends the ASCII one and
// this only exists to find the cap it belongs to.
const KEYSTROKE_ALIASES: Record<string, string> = {
  "*": "×",
  "/": "÷",
  "-": "−",
};

/**
 * The pad key a hardware keystroke lands on, or null when this layout has no
 * cap for it — a mode that hides `%` still accepts a typed one, it just has
 * nothing to light.
 *
 * `typesHexC` mirrors the keydown handler's own reading of `c`: on a hex pad
 * it is the hex digit, everywhere else it is Clear.
 */
function keyIdForKeystroke(
  mode: Mode,
  key: string,
  typesHexC: boolean,
): string | null {
  const byAction = (action: KeyDef["action"]) =>
    mode.keys.find((k) => k.action === action)?.id ?? null;
  if (key === "Enter" || key === "=") return byAction("equals");
  if (key === "Backspace" || key === "Escape") return byAction("clear");
  if (!typesHexC && (key === "c" || key === "C")) return byAction("clear");
  const input = KEYSTROKE_ALIASES[key] ?? key;
  const match =
    mode.keys.find((k) => k.input === input) ??
    mode.keys.find((k) => k.input?.toUpperCase() === input.toUpperCase());
  return match?.id ?? null;
}

// How far a swipe down the display must travel to count as one.
const REVEAL_AT = 56;

// …and how far a pull down the tape must. Shorter, because it has to fit
// inside a tape resting at a couple of rows tall.
const PULL_AT = 40;

// How far the seam must move before the gesture stops being a click. Below
// this a press on the handle just toggles the tape.
const DRAG_SLOP = 4;

// The height a keyboard step moves the seam.
const KEY_STEP = 48;

// Below this the tape is not worth sharing the column for — the drag lands
// back on resting height instead.
const COLLAPSE_AT = 48;

// The fallback floor for "the calculator no longer fits", used only until the
// display and the keypad have been measured (they state their own minimums,
// which move with the mode and the text sizes).
const FALLBACK_CALC_FLOOR = 320;

// The share of the column the tape opens to when it is toggled rather than
// dragged — the half-and-half it has always used.
const HALF = 0.5;

// How the tape is sized right now. `auto` is its resting height (content, up
// to a few entries); `share` is a fraction of the column, wherever the seam
// was left; `full` is the whole screen, calculator and all.
type TapeSize =
  { kind: "auto" } | { kind: "share"; share: number } | { kind: "full" };

// How long the in-place copy confirmation stays up — the tape's beat, so both
// copies read the same (HistoryEntryRow.tsx).
const COPIED_MS = 1200;

// How long a repeated `=` keeps the entry it restates lit. Every repeat
// refreshes it, so a held key holds the highlight and it fades once the key
// comes up.
const REPEAT_HIGHLIGHT_MS = 1200;

// Best-effort clipboard read: null when the browser has no async clipboard,
// or when the user (or the permission prompt) says no. The paste half of the
// bar hangs off the answer, so a refusal simply leaves it dark.
async function readClipboardText(): Promise<string | null> {
  try {
    if (!navigator.clipboard?.readText) return null;
    return await navigator.clipboard.readText();
  } catch {
    return null;
  }
}

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
  displayTextSize,
  onLogEntry,
  onNoteEntry,
  onStarEntry,
  onDeleteEntry,
  onClearHistory,
}: Props) {
  const [expression, setExpression] = useState("");
  const [error, setError] = useState<string | null>(null);
  // The last result the expression evaluated to. Half-typed expressions
  // ("12+") have no value, and blanking the headline on every operator press
  // would make it strobe — so the last real answer stays up, dimmed, until
  // the expression evaluates again.
  const [lastResult, setLastResult] = useState<string | null>(null);
  // The result `=` seeded the current expression with — non-null exactly
  // while the next `=` would extend the chain rather than start a new one.
  const [chainFrom, setChainFrom] = useState<string | null>(null);
  // The tape entry a repeated `=` pointed back at, lit instead of copied onto
  // the end of the tape. Null while nothing is being restated.
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const tapeEndRef = useRef<HTMLDivElement>(null);
  const highlightTimer = useRef<number | undefined>(undefined);

  // The highlight is a timer, so it must not outlive the screen.
  useEffect(
    () => () => {
      window.clearTimeout(highlightTimer.current);
    },
    [],
  );

  const highlightEntry = useCallback((entryId: string) => {
    setHighlightId(entryId);
    window.clearTimeout(highlightTimer.current);
    highlightTimer.current = window.setTimeout(
      () => setHighlightId(null),
      REPEAT_HIGHLIGHT_MS,
    );
    // The entry being pointed at is the newest one, and a tape scrolled away
    // from its end would light it out of sight.
    tapeEndRef.current?.scrollIntoView({ block: "end" });
  }, []);

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

  // What the headline reads, and whether it is still speaking for what is on
  // the expression line below it. An empty display rests at 0; a half-typed
  // one falls back to the last answer, and says so by dimming.
  const typing = expression.trim() !== "";
  const resultStale = typing && preview === null;
  const result = typing ? (preview ?? lastResult ?? "0") : "0";

  useEffect(() => {
    if (preview !== null) setLastResult(preview);
  }, [preview]);

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
    setLastResult(null);
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
      // A press that would only restate the entry above it — the held key,
      // or the same calculation typed out again — points at that entry
      // instead of appending a twin of it.
      const repeat = repeatedEntry(session, expr, result);
      if (repeat) highlightEntry(repeat.id);
      else {
        setHighlightId(null);
        onLogEntry(
          expr,
          result,
          chainFrom !== null && continuesFrom(expr, chainFrom),
        );
      }
      // Chain: the result becomes the start of the next expression.
      setExpression(result);
      setChainFrom(result);
      setError(null);
    } catch (err) {
      setError(err instanceof EvalError ? err.message : "error");
    }
  }, [expression, chainFrom, onLogEntry, session, highlightEntry]);

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

  // Whether this layout spends `C` as a hex digit (the programmer pad and the
  // custom modes built on it). Where it does, a typed `c` has to keep meaning
  // what the cap says rather than becoming Clear.
  const typesHexC = useMemo(
    () => mode.keys.some((k) => k.input === "C"),
    [mode],
  );

  // Hardware keyboard support. Every keystroke the calculator answers also
  // lights the cap that answered it (`pressedKeyId`), so typing is felt on the
  // pad the way tapping is. Auto-repeat keeps refreshing it, so a held key
  // stays lit; the release clears it.
  const [pressedKeyId, setPressedKeyId] = useState<string | null>(null);
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
      // `C` is the calculator's clear the world over, so the desktop keyboard
      // gets it too — except on a pad that spends `C` as a hex digit, where
      // typing one has to keep meaning what the cap says. Escape clears on
      // every pad regardless.
      if (typesHexC ? false : e.key === "c" || e.key === "C") {
        clear();
        e.preventDefault();
      } else if (/^[0-9a-fA-Fx.+\-*/%^()!&|~<>]$/.test(e.key)) {
        append(e.key);
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === "=") {
        equals();
        e.preventDefault();
      } else if (e.key === "Backspace") {
        backspace();
      } else if (e.key === "Escape") {
        clear();
      } else {
        return;
      }
      setPressedKeyId(keyIdForKeystroke(mode, e.key, typesHexC));
    };
    const onKeyup = () => setPressedKeyId(null);
    // A keystroke taken while the window is losing focus never reports its
    // release, which would strand a cap lit.
    const onBlur = () => setPressedKeyId(null);
    window.addEventListener("keydown", onKeydown);
    window.addEventListener("keyup", onKeyup);
    window.addEventListener("blur", onBlur);
    return () => {
      window.removeEventListener("keydown", onKeydown);
      window.removeEventListener("keyup", onKeyup);
      window.removeEventListener("blur", onBlur);
    };
  }, [append, equals, backspace, clear, mode, typesHexC]);

  // ---- how the tape and the calculator split the column -------------------

  const columnRef = useRef<HTMLDivElement>(null);
  const tapeRef = useRef<HTMLDivElement>(null);
  const displayRef = useRef<HTMLDivElement>(null);

  const [tape, setTape] = useState<TapeSize>(() =>
    historyOpen ? { kind: "share", share: HALF } : { kind: "auto" },
  );
  // True only while the seam is under a pointer — the flex basis animates on
  // every other change, but a transition during a drag lags the finger.
  const [dragging, setDragging] = useState(false);
  const full = tape.kind === "full";

  // App's own idea of open/closed (it opens the tape when a saved session is
  // loaded, and shuts it for a new scratch). Mirrored both ways through this
  // ref, so neither side re-triggers the other.
  const openRef = useRef(historyOpen);

  // What the display and the keypad together insist on. Both state a floor in
  // CSS — the display for the type size it draws, the keypad for its row
  // count — so the seam asks them rather than guessing, and the answer moves
  // with the mode and the Appearance settings. Remembered across `full`,
  // where neither element is mounted to be asked.
  const calcFloor = useRef(FALLBACK_CALC_FLOOR);
  useEffect(() => {
    const display = displayRef.current;
    const keypad =
      columnRef.current?.querySelector<HTMLElement>("[data-calc-keypad]");
    if (!display || !keypad) return;
    const floor =
      (Number.parseFloat(getComputedStyle(display).minHeight) || 0) +
      (Number.parseFloat(getComputedStyle(keypad).minHeight) || 0);
    if (floor > 0) calcFloor.current = floor;
  }, [mode, hiddenKeys, displayTextSize, tape.kind]);

  // The one door into the tape's size, and so the one place that owns the
  // rule: a share that would leave the calculator under its own floor is not
  // a share at all — the tape takes the screen instead.
  // Where the seam was last *asked* to sit, in pixels — the base a keyboard
  // step works from. Measuring instead would stall the moment the tape goes
  // full: the element stops moving, so every arrow press would start over
  // from the same height and never climb back out. Cleared by any other way
  // of resizing, which re-bases the next step on what is actually on screen.
  const seamTarget = useRef<number | null>(null);

  const resize = useCallback(
    (next: TapeSize) => {
      seamTarget.current = null;
      let size = next;
      if (size.kind === "share") {
        const column = columnRef.current?.getBoundingClientRect().height ?? 0;
        if (column > 0 && column * (1 - size.share) < calcFloor.current) {
          size = { kind: "full" };
        }
      }
      setTape(size);
      const open = size.kind !== "auto";
      if (open === openRef.current) return;
      openRef.current = open;
      onHistoryOpenChange(open);
    },
    [onHistoryOpenChange],
  );

  useEffect(() => {
    if (historyOpen === openRef.current) return;
    openRef.current = historyOpen;
    resize(historyOpen ? { kind: "share", share: HALF } : { kind: "auto" });
  }, [historyOpen, resize]);

  // A share is a fraction, but the floor it has to clear is in pixels — so a
  // window that shrinks under a tape left at half can cramp the calculator
  // without anyone having touched the seam. Re-run the rule when it does.
  useEffect(() => {
    if (tape.kind !== "share") return;
    const recheck = () => resize(tape);
    window.addEventListener("resize", recheck);
    return () => window.removeEventListener("resize", recheck);
  }, [tape, resize]);

  // Land a dragged (or arrow-keyed) seam height on a size. `resize` decides
  // whether the share it is handed can stand.
  const settle = useCallback(
    (height: number, columnHeight: number) => {
      if (columnHeight <= 0) return;
      const next = Math.min(Math.max(height, 0), columnHeight);
      if (next < COLLAPSE_AT) resize({ kind: "auto" });
      else resize({ kind: "share", share: next / columnHeight });
      seamTarget.current = next;
    },
    [resize],
  );

  const seam = useRef<{ y: number; height: number; column: number } | null>(
    null,
  );
  // Set once a press on the seam has travelled: the click that trails it is a
  // drag landing, not a toggle.
  const seamMoved = useRef(false);

  const onSeamPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    seam.current = {
      y: e.clientY,
      height: tapeRef.current?.getBoundingClientRect().height ?? 0,
      column: columnRef.current?.getBoundingClientRect().height ?? 0,
    };
    seamMoved.current = false;
    setDragging(true);
  };

  const onSeamPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const start = seam.current;
    if (!start) return;
    const dy = e.clientY - start.y;
    if (!seamMoved.current && Math.abs(dy) < DRAG_SLOP) return;
    seamMoved.current = true;
    settle(start.height + dy, start.column);
  };

  const endSeamDrag = () => {
    seam.current = null;
    setDragging(false);
  };

  const toggleTape = () => {
    resize(
      tape.kind === "auto" ? { kind: "share", share: HALF } : { kind: "auto" },
    );
  };

  const onSeamKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const from =
      seamTarget.current ??
      tapeRef.current?.getBoundingClientRect().height ??
      0;
    settle(
      from + (e.key === "ArrowDown" ? KEY_STEP : -KEY_STEP),
      columnRef.current?.getBoundingClientRect().height ?? 0,
    );
  };

  // The display's swipe steps through the three sizes rather than jumping to
  // an end, so the gesture that opens the tape can also close it again.
  const stepOpen = () =>
    resize(
      tape.kind === "auto" ? { kind: "share", share: HALF } : { kind: "full" },
    );
  const stepShut = () =>
    resize(full ? { kind: "share", share: HALF } : { kind: "auto" });

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
    if (dy > REVEAL_AT) stepOpen();
    else if (dy < -REVEAL_AT) stepShut();
  };

  // …and pull the tape itself down to open it the whole way. Armed only from
  // the top of the list, so the gesture never fights a scroll.
  //
  // Touch events rather than pointer events, alone in this file: the tape is
  // a scroll container, and a few pixels into a vertical drag the browser
  // claims the gesture as a scroll and *cancels* the pointer — even sitting
  // at the top with nothing to scroll to. Touches keep coming.
  //
  // It fires on the way down rather than on the lift, because a resting tape
  // is only a row or two tall: by the time the pull has travelled far enough
  // to mean anything, the finger is past the bottom of the element that would
  // have seen it let go.
  const pull = useRef<{ y: number; armed: boolean }>({ y: 0, armed: false });
  const onTapeTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    pull.current = {
      y: touch?.clientY ?? 0,
      armed:
        e.touches.length === 1 &&
        !full &&
        (tapeRef.current?.scrollTop ?? 0) <= 0,
    };
  };
  const onTapeTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!pull.current.armed || !touch) return;
    if (touch.clientY - pull.current.y < PULL_AT) return;
    pull.current.armed = false;
    resize({ kind: "full" });
  };
  const disarmPull = () => {
    pull.current.armed = false;
  };

  // Keep the tape pinned to its newest entry — it is always in view now, so
  // this runs whether or not it is expanded.
  useEffect(() => {
    tapeEndRef.current?.scrollIntoView({ block: "end" });
  }, [tape.kind, session.entries.length]);

  // Hold the display to raise the clipboard bar: copy what is on the display,
  // or paste what the clipboard is holding. The clipboard is read up front
  // rather than on the press of the paste half, because the bar has to know
  // whether there is anything to offer — a hold with an empty display and
  // nothing usable on the clipboard raises no bar at all rather than two dead
  // buttons.
  const [clipboardOpen, setClipboardOpen] = useState(false);
  const [pasteReady, setPasteReady] = useState<PasteCandidate | null>(null);
  // What the last copy took, in the tape's words — null while no
  // confirmation is up.
  const [copied, setCopied] = useState<string | null>(null);
  const copiedTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      window.clearTimeout(copiedTimer.current);
    },
    [],
  );

  // A tape taking the whole screen takes the display with it, and the bar
  // hangs off a box that is no longer there.
  useEffect(() => {
    if (full) setClipboardOpen(false);
  }, [full]);

  const displayLongPress = useLongPress(() => {
    // The press has become a clipboard gesture, so the lift that ends it must
    // not also read as a swipe on the tape.
    drag.current.active = false;
    void readClipboardText().then((text) => {
      const candidate = text === null ? null : pasteCandidate(text);
      setPasteReady(candidate);
      if (candidate || expression) setClipboardOpen(true);
    });
  });

  // The display's own copy, confirmed in place the way the tape's is — a
  // label over the number it took, so the eye never leaves it.
  const copyDisplay = useCallback(() => {
    setClipboardOpen(false);
    if (!expression) return;
    // The display holds a value once a calculation has been folded into its
    // result — the same distinction the tape's two copies draw.
    const label = preview === expression ? "Value copied" : "Expression copied";
    void copyTextToClipboard(expression).then((ok) => {
      if (!ok) return;
      setCopied(label);
      window.clearTimeout(copiedTimer.current);
      copiedTimer.current = window.setTimeout(() => setCopied(null), COPIED_MS);
    });
  }, [expression, preview]);

  // Pasting types the text onto the expression exactly as the keypad would,
  // so a paste onto a half-typed calculation continues it instead of
  // replacing it.
  const pasteIntoDisplay = useCallback(() => {
    setClipboardOpen(false);
    if (pasteReady) append(pasteReady.text);
  }, [pasteReady, append]);

  return (
    <div ref={columnRef} className="flex h-full min-h-0 flex-col">
      {/* Tape. At resting height it sizes to its content but stops at roughly
          four entries (and never takes more than a third of a short screen),
          so the recent run is always readable without hiding the keys; opened
          it takes the share the seam was left at, or the whole screen. It
          scrolls in every case. */}
      <div
        ref={tapeRef}
        className={`flex min-h-0 flex-col overflow-y-auto bg-surface ${
          dragging ? "" : "transition-[flex-basis,max-height] duration-200"
        } ${
          full
            ? "grow basis-0"
            : tape.kind === "share"
              ? "shrink-0 grow-0"
              : "shrink basis-auto max-h-[min(17rem,35svh)]"
        }`}
        style={
          tape.kind === "share"
            ? { flexBasis: `${tape.share * 100}%` }
            : undefined
        }
        aria-label="Session history"
        onTouchStart={onTapeTouchStart}
        onTouchMove={onTapeTouchMove}
        onTouchEnd={disarmPull}
        onTouchCancel={disarmPull}
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
                highlighted={entry.id === highlightId}
                onNote={onNoteEntry}
                onStar={onStarEntry}
                onDelete={onDeleteEntry}
              />
            ))
          )}
          <div ref={tapeEndRef} />
        </div>
      </div>

      {/* The seam. A hairline with a grab glyph riding it: drag to resize,
          click to toggle, arrow keys to step. The glyph carries its own
          background so the line reads as passing behind it rather than
          through it. */}
      <button
        type="button"
        className={`relative flex w-full shrink-0 cursor-row-resize touch-none items-center justify-center py-1.5 select-none ${
          full ? "pb-[max(0.375rem,env(safe-area-inset-bottom))]" : ""
        }`}
        aria-label="Resize history"
        aria-expanded={tape.kind !== "auto"}
        title={`${
          tape.kind === "auto" ? "Expand" : "Collapse"
        } the history — or drag to resize${
          session.entries.length ? ` (${session.entries.length})` : ""
        }`}
        onPointerDown={onSeamPointerDown}
        onPointerMove={onSeamPointerMove}
        onPointerUp={endSeamDrag}
        onPointerCancel={endSeamDrag}
        onKeyDown={onSeamKeyDown}
        onClick={() => {
          if (seamMoved.current) {
            seamMoved.current = false;
            return;
          }
          toggleTape();
        }}
      >
        <span
          aria-hidden="true"
          className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-line"
        />
        <span className="relative flex items-center rounded-full bg-page-bg px-2 text-muted transition-colors hover:text-fg-bright">
          <GrabHandleIcon className="h-5 w-5" />
        </span>
      </button>

      {/* Display. `select-none` (plus the iOS callout suppression) because the
          display is a keypad readout, not a document: the long press on it is
          already spoken for by the clipboard bar, and letting the platform
          answer the same gesture with a text selection paints blue handles
          over the number and drags the highlight up into the tape. The bar is
          how text leaves the display. */}
      {full ? null : (
        <div
          ref={displayRef}
          className={`relative flex shrink grow basis-0 flex-col items-end justify-end gap-1 overflow-hidden px-5 py-4 [touch-action:pan-x] [-webkit-touch-callout:none] select-none ${DISPLAY_MIN_HEIGHT[displayTextSize]}`}
          title="Hold for copy and paste"
          onPointerDown={(e) => {
            displayLongPress.onPointerDown(e);
            onDisplayPointerDown(e);
          }}
          onPointerMove={displayLongPress.onPointerMove}
          onPointerUp={(e) => {
            displayLongPress.onPointerUp(e);
            onDisplayPointerUp(e);
          }}
          onPointerLeave={displayLongPress.onPointerLeave}
          onPointerCancel={displayLongPress.onPointerCancel}
        >
          {/* The copy confirmation, in the tape's words and colours. */}
          {copied ? (
            <span
              role="status"
              className="pointer-events-none absolute top-1 right-5 z-20 rounded-md bg-accent px-2 py-0.5 text-xs font-medium text-page-bg shadow-md"
            >
              {copied}
            </span>
          ) : null}
          <DisplayReadout
            result={result}
            stale={resultStale}
            expression={expression}
            error={error}
            hex={hexPreview}
            textSize={displayTextSize}
          />
        </div>
      )}

      {/* The clipboard bar the display's long press raises. It renders
          nothing in place — the pill portals itself out to `document.body`
          (see ClipboardPill.tsx). */}
      <ClipboardPill
        open={clipboardOpen}
        anchorRef={displayRef}
        copyLabel={expression ? clipLabel(expression) : null}
        pasteLabel={pasteReady ? clipLabel(pasteReady.text) : null}
        onCopy={copyDisplay}
        onPaste={pasteIntoDisplay}
        onDismiss={() => setClipboardOpen(false)}
      />

      {/* Keypad — the active mode's layout minus the user's hidden keys */}
      {full ? null : (
        <Keypad
          mode={mode}
          hidden={hiddenKeys}
          keyFeedback={keyFeedback}
          textSize={keyTextSize}
          clearIsBackspace={expression.length > 0}
          onKey={onKey}
          pressedKeyId={pressedKeyId}
          onKeyLongPress={onKeyLongPress}
        />
      )}
    </div>
  );
}
