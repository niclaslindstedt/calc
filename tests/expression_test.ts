// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { expressionSegments } from "../src/app/expression.ts";

// Shorthand: the reading, with chipped operators bracketed.
function read(text: string): string {
  return expressionSegments(text)
    .map((s) => (s.op ? `[${s.text}]` : s.text))
    .join("");
}

describe("expressionSegments", () => {
  it("lifts binary operators out of their operands", () => {
    expect(read("1+2")).toBe("1[+]2");
    expect(read("25+95+13")).toBe("25[+]95[+]13");
    expect(read("6×7÷2")).toBe("6[×]7[÷]2");
    expect(read("10%3^2")).toBe("10[%]3[^]2");
  });

  it("keeps a leading sign welded to its number", () => {
    expect(read("-5")).toBe("-5");
    expect(read("−5+1")).toBe("−5[+]1");
    expect(read("1--2")).toBe("1[-]-2");
    expect(read("2^-1")).toBe("2[^]-1");
    expect(read("(-5)")).toBe("(-5)");
    expect(read("~5")).toBe("~5");
    expect(read("1&~2")).toBe("1[&]~2");
  });

  it("leaves brackets, functions and literals plain", () => {
    expect(read("sin(30)")).toBe("sin(30)");
    expect(read("0x1F")).toBe("0x1F");
    expect(read("(1+2)×3")).toBe("(1[+]2)[×]3");
  });

  it("chips the two-character and word operators whole", () => {
    expect(read("1<<8")).toBe("1[<<]8");
    expect(read("64>>2")).toBe("64[>>]2");
    expect(read("5 xor 3")).toBe("5 [xor] 3");
  });

  it("chips a postfix factorial without expecting an operand after it", () => {
    expect(read("5!")).toBe("5[!]");
    expect(read("5!-3")).toBe("5[!][-]3");
  });

  it("keeps whitespace with the run it sits in", () => {
    expect(read("1 + 2")).toBe("1 [+] 2");
  });

  it("reproduces the input exactly, with the right offsets", () => {
    for (const text of ["", "1+2", "-5×(3-1)", "5 xor 3!", "sin(π)÷2"]) {
      const segments = expressionSegments(text);
      expect(segments.map((s) => s.text).join("")).toBe(text);
      for (const segment of segments) {
        expect(
          text.slice(segment.start, segment.start + segment.text.length),
        ).toBe(segment.text);
      }
    }
  });
});
