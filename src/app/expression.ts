// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// How an expression is *read* — the split behind the operator chips the
// display and the tape draw. `1+2` is stored, and re-parsed, as three
// characters; it is read as a value, an operator and a value, so that is how
// it is set: the operator lifts out of the digits into a bordered glyph with
// air around it, the way it sits on the keypad.
//
// Pure and DOM-free (tests/expression_test.ts) — the renderers
// (RevealText.tsx, ExpressionText.tsx) only decide what a segment looks like,
// never where one ends.
//
// Two rules keep the reading honest rather than merely decorative:
//   - only operators with an operand on their left become chips. A leading
//     `−` (or the `~` in `~5`) is a sign on the number that follows, so it
//     stays welded to it — a chipped `[−] 5` would read as a subtraction
//     with its left half missing.
//   - brackets are structure, not arithmetic, so `(` and `)` stay plain: they
//     already group the eye, and boxing them would double the framing.
//
// Segments carry their `start` index because the display animates by
// character position (RevealText.tsx keys and delays glyphs by where they
// landed), so the split has to say where in the source each piece came from.

export type ExpressionSegment = {
  /** Index into the source expression where this segment begins. */
  start: number;
  text: string;
  /** True when the segment is an operator — the chipped kind. */
  op: boolean;
};

// Operators spelled with two characters. Tried before the single-character
// set so `<<` never reads as two stray `<`.
const TWO_CHAR_OPS = ["<<", ">>"];

// The infix operators of one character, in both the keypad's spelling and the
// one a hardware keyboard types (evaluator.ts accepts either).
const INFIX_OPS = new Set([
  "+",
  "-",
  "−",
  "*",
  "×",
  "/",
  "÷",
  "%",
  "^",
  "&",
  "|",
]);

// Written after their operand rather than between two: factorial binds to the
// number on its left. Chipped like the rest, and like the rest it leaves an
// operand behind it rather than expecting one.
const POSTFIX_OPS = new Set(["!"]);

// The characters that read as a sign rather than an operation when no operand
// precedes them. `~` is always one of these — bitwise NOT is only ever a
// prefix — so it is never chipped.
const SIGN_CHARS = new Set(["-", "−", "~"]);

// The word operator. Matched only on both-side word boundaries, so the `xor`
// inside a hex literal or a function name is left alone.
const WORD_OPS = ["xor"];

function isWordChar(ch: string | undefined): boolean {
  return ch !== undefined && /[0-9A-Za-z_.π]/.test(ch);
}

/**
 * Split `text` into the runs the display draws: plain stretches and the
 * operators between them. Concatenating every segment's `text` in order
 * reproduces the input exactly.
 */
export function expressionSegments(text: string): ExpressionSegment[] {
  const segments: ExpressionSegment[] = [];
  // The open plain run, flushed whenever an operator interrupts it.
  let runStart = 0;
  let run = "";
  // True while the next thing the expression needs is a value — at the start,
  // after an infix operator, and inside a freshly opened bracket. An infix
  // character landing here has nothing to work on, so it is a sign instead.
  let expectOperand = true;

  const flush = () => {
    if (run === "") return;
    segments.push({ start: runStart, text: run, op: false });
    run = "";
  };

  const takeOp = (start: number, op: string, postfix: boolean) => {
    flush();
    segments.push({ start, text: op, op: true });
    runStart = start + op.length;
    expectOperand = !postfix;
  };

  for (let i = 0; i < text.length;) {
    const ch = text[i];
    const two = text.slice(i, i + 2);

    if (TWO_CHAR_OPS.includes(two)) {
      takeOp(i, two, false);
      i += 2;
      continue;
    }

    const word = WORD_OPS.find(
      (w) =>
        text.startsWith(w, i) &&
        !isWordChar(text[i - 1]) &&
        !isWordChar(text[i + w.length]),
    );
    if (word) {
      takeOp(i, word, false);
      i += word.length;
      continue;
    }

    if (POSTFIX_OPS.has(ch)) {
      takeOp(i, ch, true);
      i += 1;
      continue;
    }

    if (INFIX_OPS.has(ch) && !(expectOperand && SIGN_CHARS.has(ch))) {
      takeOp(i, ch, false);
      i += 1;
      continue;
    }

    if (run === "") runStart = i;
    run += ch;
    // Whitespace decides nothing — `1 - 2` still subtracts. An opening
    // bracket, or a sign kept as one, still leaves a value outstanding.
    if (ch.trim() !== "") {
      expectOperand = ch === "(" || SIGN_CHARS.has(ch);
    }
    i += 1;
  }

  flush();
  return segments;
}

// The characters an operand can follow, so a `−` written after one of them is
// a sign rather than a subtraction. An empty left-hand side counts too.
const OPERAND_START = new Set([
  "+",
  "-",
  "−",
  "*",
  "×",
  "/",
  "÷",
  "%",
  "^",
  "&",
  "|",
  "<",
  ">",
  "(",
]);

// The characters a number, constant or literal is spelled with — `0x1F`, `π`
// and `12.5` are each one operand, not several.
const VALUE_CHARS = /[0-9.A-Za-zπ]/;

// The minus at `i` reads as a sign rather than a subtraction: nothing, an
// operator or an open bracket sits to its left, so it has no operand to take
// anything away from.
function signAt(text: string, i: number): boolean {
  const before = text.slice(0, i).trimEnd();
  return before === "" || OPERAND_START.has(before[before.length - 1]);
}

/**
 * Where the value `text` ends on begins — the start of `34` in `12+34`, of
 * `sqrt(9)` in `1+sqrt(9)`, of `0x1F` in `0x1F`. −1 when the expression does
 * not end on a value at all (it is empty, or its last character is an
 * operator or an open bracket).
 *
 * Brackets are matched back to their opener so a whole call counts as the one
 * operand it evaluates to, and a name in front of that bracket goes with it.
 */
function operandStart(text: string): number {
  // Factorials bind to the value on their left, so they are part of it.
  let i = text.length;
  while (i > 0 && text[i - 1] === "!") i -= 1;
  if (i === 0) return -1;

  if (text[i - 1] === ")") {
    let depth = 0;
    while (i > 0) {
      const ch = text[i - 1];
      if (ch === ")") depth += 1;
      else if (ch === "(") depth -= 1;
      i -= 1;
      if (depth === 0) break;
    }
    // An unbalanced `)` is not a value; leave it to the evaluator to complain.
    if (depth !== 0) return -1;
    while (i > 0 && VALUE_CHARS.test(text[i - 1])) i -= 1;
    return i;
  }

  if (!VALUE_CHARS.test(text[i - 1])) return -1;
  while (i > 0 && VALUE_CHARS.test(text[i - 1])) i -= 1;
  return i;
}

/**
 * The expression with the sign of the value the display ends on flipped — the
 * `±` key.
 *
 * It edits that value rather than appending to the expression: the value takes
 * a `−` in front of it, and one that already carries a sign gives it back, so
 * the key is its own undo. With no value to work on (an empty display, or one
 * that ends on an operator) the sign goes down on its own, ready for the
 * digits about to be typed.
 *
 * The result stays inside the one grammar every mode shares: a leading `−` is
 * the evaluator's unary minus, and the display already reads a sign as welded
 * to the value that follows it (see expressionSegments above), so `12+−5`
 * sets as `12 [+] −5`.
 */
export function toggleSign(text: string): string {
  const at = operandStart(text);
  if (at >= 0) {
    const before = text[at - 1];
    if ((before === "-" || before === "−") && signAt(text, at - 1)) {
      return text.slice(0, at - 1) + text.slice(at);
    }
    return text.slice(0, at) + "−" + text.slice(at);
  }
  const last = text[text.length - 1];
  if ((last === "-" || last === "−") && signAt(text, text.length - 1)) {
    return text.slice(0, -1);
  }
  return text + "−";
}
