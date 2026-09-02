// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// An expression set the way the app reads it: values plain, operators lifted
// into bordered accent chips with air either side, and a function with a
// symbol drawn as that symbol in the accent (see expression.ts for the split,
// `.calc-op` and `.calc-fn` in styles.css for the two treatments). This is
// the still version — the tape's rows, where the text simply is. The
// display's typed-in twin animates instead (RevealText.tsx) but draws the
// same chips and symbols, so a calculation looks the same on the way in as it
// does once logged.

import { expressionSegments } from "./expression.ts";

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
          <span key={segment.start} className="calc-op">
            {segment.text}
          </span>
        ) : segment.display ? (
          // `sqrt(9)` reads as `√(9)`: the stored word stays in the entry,
          // the glyph is only how it is set.
          <span key={segment.start} className="calc-fn">
            {segment.display}
          </span>
        ) : (
          // `whitespace-pre` so the spaces around a word operator survive
          // sitting next to an inline-block chip.
          <span key={segment.start} className="whitespace-pre">
            {segment.text}
          </span>
        ),
      )}
    </span>
  );
}
