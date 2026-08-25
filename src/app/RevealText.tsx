// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The display's typed-in text, one character at a time. Every glyph gets its
// own inline-block so a newly arrived one can slide in from the right while
// the text already on the line settles left of it — the readout "types" the
// way the keypad is pressed.
//
// The whole trick is identity: characters are keyed, so an append mounts one
// new span and leaves the rest alone (no restart of an animation still in
// flight), an erase unmounts spans, and a wholesale replacement — the result
// `=` hands back — bumps a generation so every glyph mounts fresh and the new
// value reveals as a run. Delays are assigned once, when a character first
// appears, and never rewritten underneath a running animation.
//
// The animation itself lives in styles.css (`.calc-char`), which also drops
// it under `prefers-reduced-motion`.

import { useRef } from "react";

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

  return (
    <span className={className}>
      {Array.from(text, (char, index) => (
        <span
          key={`${generation.current}:${index}`}
          className="calc-char"
          style={{ animationDelay: `${delays.current[index] ?? 0}ms` }}
          aria-hidden="true"
        >
          {char}
        </span>
      ))}
      {/* The split-up glyphs are decoration; screen readers get the string. */}
      <span className="sr-only">{text}</span>
    </span>
  );
}
