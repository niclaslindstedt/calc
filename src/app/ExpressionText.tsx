// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// An expression set the way the app reads it: values plain, operators lifted
// into bordered accent chips with air either side (see expression.ts for the
// split, and `.calc-op` in styles.css for the chip). This is the still
// version — the tape's rows, where the text simply is. The display's typed-in
// twin animates instead (RevealText.tsx) but draws the same chips, so a
// calculation looks the same on the way in as it does once logged.

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
