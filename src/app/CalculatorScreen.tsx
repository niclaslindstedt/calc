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
// a single hairline with a grab glyph on it. The tape itself is a handle as
// well — drag anywhere on it and the seam comes along, so a tape that has
// taken the screen is shut with the same gesture that opened it rather than
// by hunting for a hairline at the bottom edge. The tape is also a scroll
// container, so the two gestures split it the way a sheet does: the list
// keeps the drag while it still has somewhere to scroll, and hands it over
// at the ends.
//
// Wherever it is grabbed, the tape takes whatever share of the column it is
// left at — there are no steps to land on, so a desktop pointer can stop
// anywhere. Two ends are special:
//
//   - drag it (nearly) shut and the tape falls back to resting height, where
//     it sizes to its content and keeps the last few entries in view;
//   - drag it past the floors the display and the keypad set for themselves
//     and the calculator slides off the bottom of the column instead of being
//     squeezed under them — carry on and the tape has the whole screen, the
//     seam parked at the bottom. Let go with the calculator half gone and it
//     lands on whichever end is nearer, so nothing rests half-covered.
//
// On a phone the display answers the same gesture: a swipe down or up on it
// steps the tape open and shut.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  copyTextToClipboard,
  useLongPress,
} from "@niclaslindstedt/oss-framework/hooks";

import { chainExpression } from "./chain.ts";
import { ClipboardPill } from "./ClipboardPill.tsx";
import { DISPLAY_MIN_HEIGHT, DisplayReadout } from "./DisplayReadout.tsx";
import {
  closeParens,
  evaluate,
  EvalError,
  formatHex,
  formatResult,
} from "./evaluator.ts";
import { toggleSign } from "./expression.ts";
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
 * `typesHexC` mirrors the keydown handler's own reading of a shifted `C`: on
 * a hex pad it is the hex digit, everywhere else it is Clear.
 */
function keyIdForKeystroke(
  mode: Mode,
  key: string,
  typesHexC: boolean,
): string | null {
  const byAction = (action: KeyDef["action"]) =>
    mode.keys.find((k) => k.action === action)?.id ?? null;
  if (key === "Enter" || key === "=") return byAction("equals");
  if (key === "Backspace" || key === "Escape" || key === "Delete") {
    return byAction("clear");
  }
  if (!typesHexC && key === "C") return byAction("clear");
  const input = KEYSTROKE_ALIASES[key] ?? key;
  const match =
    mode.keys.find((k) => k.input === input) ??
    mode.keys.find((k) => k.input?.toUpperCase() === input.toUpperCase());
  return match?.id ?? null;
}

// How far a swipe down the display must travel to count as one.
const REVEAL_AT = 56;

// How far a drag must travel before it stops being a click. Below this a
// press on the seam only toggles the tape, and a press on the tape is still
// a tap on the row it landed on.
const DRAG_SLOP = 4;

// The height a keyboard step moves the seam.
const KEY_STEP = 48;

// Below this the tape is not worth sharing the column for — the drag lands
// back on resting height instead.
const COLLAPSE_AT = 48;

// Once a drag has pushed the calculator past its floor there is nowhere
// sensible to stop between the two ends: the display would be half a readout
// and the keypad half a row. So a release lands on one of them — the whole
// screen once this much of the calculator has gone under the fold, and back
// onto its floor otherwise.
const FULL_AT = 0.35;

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

  // The `±` key: it rewrites the value the display ends on rather than adding
  // to the expression — see toggleSign.
  const negate = useCallback(() => {
    setError(null);
    setExpression((prev) => toggleSign(prev));
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
    // Brackets still open are closed here rather than at evaluation time, so
    // what the tape records is the whole expression the answer came from —
    // `sin(2)`, re-evaluable in any mode, not the `sin(2` that was typed.
    const expr = closeParens(expression.trim());
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
      else if (key.action === "negate") negate();
      else if (key.input) append(key.input);
    },
    [expression, backspace, equals, negate, append],
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

  // Hardware keyboard support. A keyboard types into the one grammar every
  // mode shares rather than into the pad in front of it: letters go through,
  // so `sqrt(2)+sin(0)` types on the basic pad exactly as it does on the
  // scientific one. The layouts stay layouts — what a pad shows is which keys
  // are worth a thumb, not which expressions the calculator understands.
  //
  // Every keystroke the calculator answers also lights the cap that answered
  // it (`pressedKeyId`), so typing is felt on the pad the way tapping is —
  // where there is a cap for it; a typed name that no key on this pad spells
  // simply lands on the display. Auto-repeat keeps refreshing the light, so a
  // held key stays lit; the release clears it.
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
      // `C` is the calculator's clear the world over, so a shifted one still
      // is — except on a pad that spends `C` as a hex digit, where typing one
      // has to keep meaning what the cap says. The unshifted `c` cannot be:
      // it opens `cos(`, `ceil(` and `cbrt(`. Escape and Delete clear on
      // every pad regardless, so the plain key is never the only way.
      if (!typesHexC && e.key === "C") {
        clear();
        e.preventDefault();
      } else if (/^[0-9a-zA-Zπ.+\-*/%^()!&|~<>]$/.test(e.key)) {
        append(e.key);
        e.preventDefault();
      } else if (e.key === "Enter" || e.key === "=") {
        equals();
        e.preventDefault();
      } else if (e.key === "Backspace") {
        backspace();
      } else if (e.key === "Escape" || e.key === "Delete") {
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
  // True only while a drag has hold of the tape, from the seam or from the
  // tape itself — the flex basis animates on every other change, but a
  // transition during a drag lags the finger.
  const [dragging, setDragging] = useState(false);
  const full = tape.kind === "full";

  // App's own idea of open/closed (it opens the tape when a saved session is
  // loaded, and shuts it for a new scratch). Mirrored both ways through this
  // ref, so neither side re-triggers the other.
  const openRef = useRef(historyOpen);

  // What the display and the keypad together insist on. Both state a floor in
  // CSS — the display for the type size it draws, the keypad for its row
  // count — so the seam asks them rather than guessing, and the answer moves
  // with the mode and the Appearance settings. Neither is ever unmounted (a
  // covered calculator is pushed under the fold, not taken away), so the
  // answer is always there for the asking.
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
  }, [mode, hiddenKeys, displayTextSize]);

  // How tall the seam draws, measured rather than assumed: it is the column's
  // one fixed row, so it is exactly the difference between "the tape has the
  // whole screen" and "the tape has the whole screen and its handle with it".
  // It grows when the tape goes full (the safe-area inset lands on it), hence
  // the observer rather than a single reading.
  const seamRef = useRef<HTMLButtonElement>(null);
  const [seamHeight, setSeamHeight] = useState(0);
  useEffect(() => {
    const el = seamRef.current;
    if (!el) return;
    const measure = () => setSeamHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // The tallest the tape can be drawn and still leave its own handle on
  // screen — what `full` resolves to, and the ceiling a drag clamps against.
  const tapeCeiling = useCallback(
    (column: number) => Math.max(column - seamHeight, 0),
    [seamHeight],
  );

  // Where the seam was last *asked* to sit, in pixels — the base a keyboard
  // step works from. Measuring instead would stall the moment the tape goes
  // full: the element stops moving, so every arrow press would start over
  // from the same height and never climb back out. Cleared by any other way
  // of resizing, which re-bases the next step on what is actually on screen.
  const seamTarget = useRef<number | null>(null);

  // The tape's kind as last set, for the pin below — `apply` is the only door
  // into `setTape`, so the ref cannot drift from the state.
  const tapeKind = useRef<TapeSize["kind"]>(tape.kind);

  // Run something two frames from now, and a way to call that off. Two, not
  // one: a size that is meant to animate has to be set in a *later* style
  // recalculation than the transition it animates under, or CSS treats the
  // pair as a single change and there is nothing to interpolate. Both ends of
  // a drag need it — the transition comes back on as the finger lifts, and
  // the landing has to wait for it.
  const frames = useRef<number | undefined>(undefined);
  const cancelFrames = useCallback(() => {
    if (frames.current !== undefined) cancelAnimationFrame(frames.current);
    frames.current = undefined;
  }, []);
  const afterTwoFrames = useCallback(
    (run: () => void) => {
      cancelFrames();
      frames.current = requestAnimationFrame(() => {
        frames.current = requestAnimationFrame(() => {
          frames.current = undefined;
          run();
        });
      });
    },
    [cancelFrames],
  );
  useEffect(() => cancelFrames, [cancelFrames]);

  // Set the size, and tell App whether that counts as open. Everything ends
  // up here; `resize` is the guarded door for the toggle, the swipes and the
  // keyboard, while a drag goes straight to `track`.
  const apply = useCallback(
    (size: TapeSize) => {
      tapeKind.current = size.kind;
      setTape(size);
      const open = size.kind !== "auto";
      if (open === openRef.current) return;
      openRef.current = open;
      onHistoryOpenChange(open);
    },
    [onHistoryOpenChange],
  );

  // The guarded door into the tape's size, and so the place that owns the
  // rule: a share that would leave the calculator under its own floor is not
  // a share at all — the tape takes the screen instead. (A drag is exempt,
  // and goes through `track`: what it does between the two is slide the
  // calculator out rather than squeeze it.)
  const resize = useCallback(
    (next: TapeSize) => {
      seamTarget.current = null;
      const column = columnRef.current?.getBoundingClientRect().height ?? 0;
      let size = next;
      if (
        size.kind === "share" &&
        column > 0 &&
        tapeCeiling(column) - column * size.share < calcFloor.current
      ) {
        size = { kind: "full" };
      }
      // `flex-basis: auto` is not a length, so a tape opening from resting
      // height has no first frame to animate from and would jump the whole
      // way. Pin it to the height it is actually drawn at, let that paint,
      // and the transition has both ends it needs. (Shutting back to resting
      // height has no such trick — that target is whatever the content comes
      // to, which only the layout knows.)
      const from = tapeRef.current?.getBoundingClientRect().height ?? 0;
      if (tapeKind.current === "auto" && size.kind !== "auto" && from > 0) {
        const landing = size;
        apply({ kind: "share", share: from / column });
        afterTwoFrames(() => apply(landing));
        return;
      }
      cancelFrames();
      apply(size);
    },
    [apply, afterTwoFrames, cancelFrames, tapeCeiling],
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

  // Follow the finger. No landing rule here: mid-drag the tape may sit
  // anywhere, the calculator sliding under the fold as it passes its floor.
  // `settle` is what decides where the gesture comes to rest.
  const track = useCallback(
    (height: number, columnHeight: number) => {
      if (columnHeight <= 0) return;
      const next = Math.min(Math.max(height, 0), tapeCeiling(columnHeight));
      seamTarget.current = next;
      apply({ kind: "share", share: next / columnHeight });
    },
    [apply, tapeCeiling],
  );

  // Land a dragged (or arrow-keyed) height on a size. Three places to land:
  // resting height, a share that leaves the calculator whole, or the whole
  // screen — never a share that rests on top of half a keypad.
  const settle = useCallback(
    (height: number, columnHeight: number) => {
      if (columnHeight <= 0) return;
      const ceiling = tapeCeiling(columnHeight);
      const next = Math.min(Math.max(height, 0), ceiling);
      seamTarget.current = next;
      if (next < COLLAPSE_AT) {
        apply({ kind: "auto" });
        return;
      }
      // The tallest tape that still leaves the calculator whole. Past it the
      // calculator is being covered rather than shared with.
      const floor = Math.max(ceiling - calcFloor.current, 0);
      if (next <= floor) {
        apply({ kind: "share", share: next / columnHeight });
      } else if (next - floor >= (ceiling - floor) * FULL_AT) {
        apply({ kind: "full" });
      } else {
        seamTarget.current = floor;
        apply({ kind: "share", share: floor / columnHeight });
      }
    },
    [apply, tapeCeiling],
  );

  const seam = useRef<{
    y: number;
    height: number;
    column: number;
    last: number;
  } | null>(null);
  // Set once a press on the seam has travelled: the click that trails it is a
  // drag landing, not a toggle.
  const seamMoved = useRef(false);

  const onSeamPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    cancelFrames();
    const height = tapeRef.current?.getBoundingClientRect().height ?? 0;
    seam.current = {
      y: e.clientY,
      height,
      column: columnRef.current?.getBoundingClientRect().height ?? 0,
      last: height,
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
    start.last = start.height + dy;
    track(start.last, start.column);
  };

  const endSeamDrag = () => {
    const start = seam.current;
    seam.current = null;
    setDragging(false);
    if (start && seamMoved.current)
      afterTwoFrames(() => settle(start.last, start.column));
  };

  const toggleTape = () => {
    resize(
      tape.kind === "auto" ? { kind: "share", share: HALF } : { kind: "auto" },
    );
  };

  const onSeamKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
    e.preventDefault();
    const down = e.key === "ArrowDown";
    const column = columnRef.current?.getBoundingClientRect().height ?? 0;
    if (column <= 0) return;
    // The last step at either end covers the calculator or hands it back,
    // and that is a state rather than a distance — `settle` would only ever
    // magnet a single step past the floor back onto it, leaving the keyboard
    // unable to reach the whole screen at all. So it takes that one whole.
    const floor = Math.max(tapeCeiling(column) - calcFloor.current, 0);
    if (full) {
      if (!down) settle(floor, column);
      return;
    }
    const from =
      seamTarget.current ??
      tapeRef.current?.getBoundingClientRect().height ??
      0;
    if (down && from >= floor - 1) {
      seamTarget.current = tapeCeiling(column);
      apply({ kind: "full" });
      return;
    }
    settle(from + (down ? KEY_STEP : -KEY_STEP), column);
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

  // ---- dragging the tape itself -------------------------------------------
  //
  // The whole panel is a handle. It is a scroll container too, so a drag has
  // to decide which it is: the list keeps the gesture while it still has
  // somewhere to scroll the way the finger is going, and only hands it to the
  // seam at the ends. `tapeScrolls` below turns the browser's own vertical
  // panning off entirely while there is nothing to scroll, which is the case
  // that matters most — a tape holding a handful of entries over the whole
  // screen has to be draggable *somewhere*.
  const tapeDrag = useRef<{
    y: number;
    height: number;
    column: number;
    last: number;
    mode: "idle" | "scroll" | "resize";
  } | null>(null);
  // Set once a drag on the tape has moved the seam: the tap that trails it
  // belongs to the drag, not to the row it happens to end on.
  const tapeDragged = useRef(false);

  const beginTapeDrag = (y: number) => {
    cancelFrames();
    tapeDragged.current = false;
    tapeDrag.current = {
      y,
      height: tapeRef.current?.getBoundingClientRect().height ?? 0,
      column: columnRef.current?.getBoundingClientRect().height ?? 0,
      last: 0,
      mode: "idle",
    };
  };

  // True once the drag has taken the gesture over, so a touch handler knows
  // to hold off the browser's own reading of it.
  const moveTapeDrag = (y: number): boolean => {
    const drag = tapeDrag.current;
    if (!drag) return false;
    const dy = y - drag.y;
    if (drag.mode === "idle") {
      if (Math.abs(dy) < DRAG_SLOP) return false;
      const el = tapeRef.current;
      const top = el?.scrollTop ?? 0;
      const room = el ? el.scrollHeight - el.clientHeight : 0;
      // Pulling down walks back through older entries and pushing up returns
      // to the newest, so the list is owed the gesture while the direction it
      // is going still has somewhere to land.
      drag.mode = (dy > 0 ? top > 0 : top < room - 1) ? "scroll" : "resize";
      if (drag.mode === "resize") setDragging(true);
    }
    if (drag.mode !== "resize") return false;
    drag.last = drag.height + dy;
    tapeDragged.current = true;
    track(drag.last, drag.column);
    return true;
  };

  const endTapeDrag = () => {
    const drag = tapeDrag.current;
    tapeDrag.current = null;
    if (drag?.mode !== "resize") return;
    setDragging(false);
    afterTwoFrames(() => settle(drag.last, drag.column));
  };

  const onTapeTouchStart = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (e.touches.length !== 1 || !touch) {
      tapeDrag.current = null;
      return;
    }
    // A touchmove always goes to the element the touch started on, however
    // far the finger travels, so the tape's own handlers see the whole
    // gesture — which is not true of the mouse below.
    beginTapeDrag(touch.clientY);
  };
  const onTapeTouchMove = (e: React.TouchEvent<HTMLDivElement>) => {
    const touch = e.touches[0];
    if (!touch) return;
    // Where the tape can still scroll the browser owns the gesture and this
    // does nothing; where it cannot, `touch-action: none` has left it to us.
    if (moveTapeDrag(touch.clientY) && e.cancelable) e.preventDefault();
  };

  // The mouse takes the pointer path instead: it never scrolls by dragging,
  // so the whole panel is its to grab, at any scroll position.
  //
  // The rest of the gesture is followed on the window, because a tape only a
  // row or two tall is left behind by the second mousemove of the drag that
  // is opening it. Pointer capture would keep the events coming too, at the
  // price of retargeting the click that ends a press which turned out to be
  // a tap on a row — and the rows are all click.
  const releaseMouseDrag = useRef<(() => void) | null>(null);
  useEffect(() => () => releaseMouseDrag.current?.(), []);

  const onTapePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === "touch" || e.button !== 0) return;
    releaseMouseDrag.current?.();
    beginTapeDrag(e.clientY);
    const move = (ev: PointerEvent) => moveTapeDrag(ev.clientY);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      releaseMouseDrag.current = null;
      endTapeDrag();
    };
    releaseMouseDrag.current = up;
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const onTapeClickCapture = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!tapeDragged.current) return;
    tapeDragged.current = false;
    e.preventDefault();
    e.stopPropagation();
  };

  // Whether the list has anywhere to scroll. While it has not, the tape hands
  // every vertical gesture to the drag above rather than to the browser —
  // `touch-action` is read when the touch starts, so this has to be known in
  // advance rather than worked out mid-gesture.
  const [tapeScrolls, setTapeScrolls] = useState(false);
  useEffect(() => {
    const el = tapeRef.current;
    if (!el) return;
    const measure = () => setTapeScrolls(el.scrollHeight - el.clientHeight > 1);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) observer.observe(el.firstElementChild);
    return () => observer.disconnect();
  }, []);

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
  // hangs off a box that is no longer on screen.
  useEffect(() => {
    if (full) setClipboardOpen(false);
  }, [full]);

  // The covered calculator is pushed under the fold rather than unmounted, so
  // that the tape can slide over it instead of snapping past it. Down there
  // it must be out of reach: no tab stops, nothing for a screen reader to
  // read out, no keys to press by mistake.
  useEffect(() => {
    const keypad =
      columnRef.current?.querySelector<HTMLElement>("[data-calc-keypad]");
    for (const el of [displayRef.current, keypad]) {
      if (el) el.inert = full;
    }
  }, [full, mode, hiddenKeys]);

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
    // `overflow-hidden`, because a tape past the calculator's floor stops
    // sharing the column and starts covering it: the display and the keypad
    // keep their own heights and slide off the bottom edge, which is what
    // makes that last stretch of the drag a slide rather than a snap.
    <div
      ref={columnRef}
      className="flex h-full min-h-0 flex-col overflow-hidden"
    >
      {/* Tape. At resting height it sizes to its content but stops at roughly
          four entries (and never takes more than a third of a short screen),
          so the recent run is always readable without hiding the keys; opened
          it takes the share the seam was left at, or the whole screen. It
          scrolls in every case. */}
      <div
        ref={tapeRef}
        className={`flex min-h-0 flex-col overflow-y-auto overscroll-contain bg-surface ${
          dragging ? "" : "transition-[flex-basis,max-height] duration-200"
        } ${tapeScrolls ? "[touch-action:pan-y]" : "[touch-action:none]"} ${
          tape.kind === "auto"
            ? "shrink basis-auto max-h-[min(17rem,35svh)]"
            : "shrink-0 grow-0"
        }`}
        style={
          tape.kind === "share"
            ? { flexBasis: `${tape.share * 100}%` }
            : tape.kind === "full"
              ? // Everything the column has, less the handle it is dragged
                // back up by. A length rather than `grow`, so the transition
                // has something to interpolate towards.
                { flexBasis: `calc(100% - ${seamHeight}px)` }
              : undefined
        }
        aria-label="Session history"
        onTouchStart={onTapeTouchStart}
        onTouchMove={onTapeTouchMove}
        onTouchEnd={endTapeDrag}
        onTouchCancel={endTapeDrag}
        onPointerDown={onTapePointerDown}
        onClickCapture={onTapeClickCapture}
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
        ref={seamRef}
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
        {/* The glyph wears the accent: it is the one thing on the seam that
            can be taken hold of, and the hairline it rides is already as
            quiet as the rest of the chrome. */}
        <span className="relative flex items-center rounded-full bg-page-bg px-2 text-accent transition-[filter] duration-150 hover:brightness-125">
          <GrabHandleIcon className="h-5 w-5" />
        </span>
      </button>

      {/* Display. `select-none` (plus the iOS callout suppression) because the
          display is a keypad readout, not a document: the long press on it is
          already spoken for by the clipboard bar, and letting the platform
          answer the same gesture with a text selection paints blue handles
          over the number and drags the highlight up into the tape. The bar is
          how text leaves the display. */}
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

      {/* Keypad — the active mode's layout minus the user's hidden keys.
          Mounted whatever the tape is doing: a covered keypad has slid off
          the bottom of the column, and taking it away instead would cost the
          slide its last frames. */}
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
    </div>
  );
}
