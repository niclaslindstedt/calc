// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The display's typed-in text, one character at a time. Every glyph gets its
// own inline-block so a newly arrived one can slide in from the right while
// the text already on the line settles left of it — the readout "types" the
// way the keypad is pressed. Operators arrive whole instead, as one chipped
// glyph, and so does a function with a symbol — `sqrt(` lands as an accented
// `√` and its bracket (expression.ts decides which runs those are,
// ExpressionText.tsx draws the still version of the same thing).
//
// The whole trick is identity: characters are keyed by where they landed, so
// an append mounts one new span and leaves the rest alone (no restart of an
// animation still in flight), an erase unmounts spans, and a wholesale
// replacement — the result `=` hands back — bumps a generation so every glyph
// mounts fresh and the new value reveals as a run. Delays are assigned once,
// when a character first appears, and never rewritten underneath a running
// animation.
//
// The animation itself lives in styles.css (`.calc-char`), which also drops
// it under `prefers-reduced-motion`.

import { useRef } from "react";

import { expressionSegments } from "./expression.ts";

// The beat between characters of the same arrival. One keypress brings one
// character, so this only shows on a paste or on a revealed result — fast
// enough to read as a single motion rather than a queue.
const STEP_MS = 22;

// …and the longest a character will wait its turn. A pasted or revealed run
// stops staggering after this many glyphs so a long number still lands at
// once instead of crawling in.
const MAX_STEPS = 10;

type Props = {
  text: string;
  className?: string;
};

export function RevealText({ text, className }: Props) {
  const shown = useRef("");
  // Bumped whenever the text is replaced rather than typed into, to remount
  // every character.
  const generation = useRef(0);
  // Per-character animation delay, by index. Written when a character first
  // appears and left alone afterwards.
  const delays = useRef<number[]>([]);

  if (text !== shown.current) {
    const before = shown.current;
    let from: number;
    if (text.startsWith(before)) {
      // Typed (or pasted) onto the end — only the new tail reveals.
      from = before.length;
    } else if (before.startsWith(text)) {
      // Erased — what is left was already on screen.
      from = text.length;
    } else {
      // Replaced wholesale: `=` folding an expression into its result.
      generation.current += 1;
      from = 0;
    }
    delays.current.length = text.length;
    for (let i = from; i < text.length; i += 1) {
      delays.current[i] = Math.min(i - from, MAX_STEPS) * STEP_MS;
    }
    shown.current = text;
  }

  const gen = generation.current;
  // `extra` is the treatment the segment asked for — the operator chip, or
  // the accent a symbol function is set in — on top of the per-character
  // animation every glyph carries.
  const glyph = (
    key: string,
    index: number,
    content: string,
    extra?: string,
  ) => (
    <span
      key={key}
      className={extra ? `calc-char ${extra}` : "calc-char"}
      style={{ animationDelay: `${delays.current[index] ?? 0}ms` }}
    >
      {content}
    </span>
  );

  return (
    <span className={className}>
      {/* The split-up glyphs are decoration; screen readers get the string. */}
      <span aria-hidden="true">
        {expressionSegments(text).map((segment) => {
          // An operator reveals as one piece: it is a single glyph on the
          // keypad, so it should not type itself in letter by letter. A
          // symbol function is one keypress and one glyph too, however many
          // characters the word behind it is stored as.
          if (segment.op)
            return glyph(
              `${gen}:${segment.start}`,
              segment.start,
              segment.text,
              "calc-op",
            );
          if (segment.display)
            return glyph(
              `${gen}:${segment.start}`,
              segment.start,
              segment.display,
              "calc-fn",
            );
          return Array.from(segment.text, (char, offset) =>
            glyph(
              `${gen}:${segment.start + offset}`,
              segment.start + offset,
              char,
            ),
          );
        })}
      </span>
      <span className="sr-only">{text}</span>
    </span>
  );
}
