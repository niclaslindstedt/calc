// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// An expression set the way the app reads it: values plain, operators lifted
// into bordered accent chips with air either side, a function with a symbol
// drawn as that symbol, and everything inside a bracket — the brackets, the
// digits, the chips and symbols between them — coloured by how deep it sits
// (see expression.ts for the split, and `.calc-op`, `.calc-fn` and
// `.calc-paren-*` in styles.css for the paint). This is the still version —
// the tape's rows, where the text simply is. The display's typed-in twin
// animates instead (RevealText.tsx) but draws the same chips, symbols and
// colours, so a calculation looks the same on the way in as it does once
// logged.

import { expressionSegments, parenClass } from "./expression.ts";

export function ExpressionText({
  text,
  className,
}: {
  text: string;
  className?: string;
}) {
  return (
    <span className={className}>
      {expressionSegments(text).map((segment) =>
        segment.op ? (
          <span
            key={segment.start}
            className={`calc-op ${parenClass(segment.depth)}`}
          >
            {segment.text}
          </span>
        ) : segment.display ? (
          // `sqrt(9)` reads as `√(9)`: the stored word stays in the entry,
          // the glyph is only how it is set.
          <span
            key={segment.start}
            className={`calc-fn ${parenClass(segment.depth)}`}
          >
            {segment.display}
          </span>
        ) : (
          // `whitespace-pre` so the spaces around a word operator survive
          // sitting next to an inline-block chip.
          <span
            key={segment.start}
            className={`whitespace-pre ${parenClass(segment.depth)}`}
          >
            {segment.text}
          </span>
        ),
      )}
    </span>
  );
}
