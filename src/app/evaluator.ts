// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The expression evaluator behind the calculator: a tokenizer + recursive
// descent parser over ordinary infix arithmetic. Pure and DOM-free so it can
// be unit-tested (tests/evaluator_test.ts) and reused by the codec round-trip.
// One shared grammar serves every calculator mode — an expression logged from
// any keypad re-evaluates identically regardless of the mode it is reopened
// in.
//
// Grammar (loosest binding first):
//   expression := xorExpr ("|" xorExpr)*
//   xorExpr    := andExpr ("xor" andExpr)*
//   andExpr    := shiftExpr ("&" shiftExpr)*
//   shiftExpr  := additive (("<<" | ">>") additive)*
//   additive   := term (("+" | "-") term)*
//   term       := unary (("*" | "/" | "%") unary)*
//   unary      := ("-" | "~") unary | power
//   power      := postfix ("^" unary)?           right-associative
//   postfix    := primary "!"*
//   primary    := number | constant | function "(" expression ")"
//              | "(" expression ")"
//
// `%` is the modulo operator, not percent — matching how the tape reads back
// as plain text. Trig works in radians. Bitwise operators require integer
// operands and evaluate over BigInt (64-bit range), so programmer-mode
// results stay exact. Errors raise EvalError with a human-readable message
// the display shows verbatim.

export class EvalError extends Error {}

// Display aliases: the keypad shows × ÷ − and π but the stored expression
// uses them too, so the tokenizer accepts both spellings.
const MUL = new Set(["*", "×"]);
const DIV = new Set(["/", "÷"]);
const MINUS = new Set(["-", "−"]);

const CONSTANTS: Record<string, number> = {
  pi: Math.PI,
  π: Math.PI,
  e: Math.E,
  tau: Math.PI * 2,
};

const FUNCTIONS: Record<string, (x: number) => number> = {
  sqrt: Math.sqrt,
  cbrt: Math.cbrt,
  sin: Math.sin,
  cos: Math.cos,
  tan: Math.tan,
  asin: Math.asin,
  acos: Math.acos,
  atan: Math.atan,
  ln: Math.log,
  log: Math.log10,
  log2: Math.log2,
  abs: Math.abs,
  round: Math.round,
  floor: Math.floor,
  ceil: Math.ceil,
};

type Op =
  | "+"
  | "-"
  | "*"
  | "/"
  | "%"
  | "^"
  | "&"
  | "|"
  | "xor"
  | "<<"
  | ">>"
  | "~"
  | "!";

type Token =
  | { kind: "number"; value: number }
  | { kind: "op"; op: Op }
  | { kind: "func"; name: string }
  | { kind: "lparen" }
  | { kind: "rparen" };

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === " " || ch === "\t") {
      i += 1;
    } else if (/^0[xb]/i.test(input.slice(i, i + 2))) {
      const isHex = input[i + 1].toLowerCase() === "x";
      const digits = isHex ? /[0-9a-fA-F]/ : /[01]/;
      let j = i + 2;
      while (j < input.length && digits.test(input[j])) j += 1;
      if (j === i + 2)
        throw new EvalError(`malformed number "${input.slice(i, j)}"`);
      tokens.push({
        kind: "number",
        value: Number.parseInt(input.slice(i + 2, j), isHex ? 16 : 2),
      });
      i = j;
    } else if (/[0-9.]/.test(ch)) {
      let j = i;
      while (j < input.length && /[0-9.]/.test(input[j])) j += 1;
      const text = input.slice(i, j);
      if ((text.match(/\./g) ?? []).length > 1 || text === ".") {
        throw new EvalError(`malformed number "${text}"`);
      }
      tokens.push({ kind: "number", value: Number.parseFloat(text) });
      i = j;
    } else if (/[a-zA-Zπ]/.test(ch)) {
      let j = i;
      while (j < input.length && /[a-zA-Z0-9π]/.test(input[j])) j += 1;
      const word = input.slice(i, j).toLowerCase();
      if (word === "xor") {
        tokens.push({ kind: "op", op: "xor" });
      } else if (word in CONSTANTS) {
        tokens.push({ kind: "number", value: CONSTANTS[word] });
      } else if (word in FUNCTIONS) {
        tokens.push({ kind: "func", name: word });
      } else {
        throw new EvalError(`unknown name "${word}"`);
      }
      i = j;
    } else if (ch === "(") {
      tokens.push({ kind: "lparen" });
      i += 1;
    } else if (ch === ")") {
      tokens.push({ kind: "rparen" });
      i += 1;
    } else if (ch === "<" || ch === ">") {
      if (input[i + 1] !== ch)
        throw new EvalError(`unexpected character "${ch}"`);
      tokens.push({ kind: "op", op: ch === "<" ? "<<" : ">>" });
      i += 2;
    } else if (ch === "+") {
      tokens.push({ kind: "op", op: "+" });
      i += 1;
    } else if (MINUS.has(ch)) {
      tokens.push({ kind: "op", op: "-" });
      i += 1;
    } else if (MUL.has(ch)) {
      tokens.push({ kind: "op", op: "*" });
      i += 1;
    } else if (DIV.has(ch)) {
      tokens.push({ kind: "op", op: "/" });
      i += 1;
    } else if (
      ch === "%" ||
      ch === "^" ||
      ch === "&" ||
      ch === "|" ||
      ch === "~" ||
      ch === "!"
    ) {
      tokens.push({ kind: "op", op: ch });
      i += 1;
    } else {
      throw new EvalError(`unexpected character "${ch}"`);
    }
  }
  return tokens;
}

// Bitwise helpers: exact over BigInt, defined only for integer operands.
function asBigInt(value: number, opName: string): bigint {
  if (!Number.isInteger(value)) {
    throw new EvalError(`${opName} needs whole numbers`);
  }
  return BigInt(value);
}

function fromBigInt(value: bigint): number {
  const num = Number(value);
  if (!Number.isSafeInteger(num)) throw new EvalError("result is too large");
  return num;
}

function factorial(value: number): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new EvalError("! needs a whole number ≥ 0");
  }
  if (value > 170) throw new EvalError("result is too large");
  let acc = 1;
  for (let n = 2; n <= value; n += 1) acc *= n;
  return acc;
}

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  parse(): number {
    if (this.tokens.length === 0) throw new EvalError("empty expression");
    const value = this.expression();
    if (this.pos < this.tokens.length) {
      throw new EvalError("unexpected trailing input");
    }
    return value;
  }

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }

  private binaryLevel(ops: readonly Op[], next: () => number): number {
    let left = next();
    for (;;) {
      const tok = this.peek();
      if (tok?.kind !== "op" || !ops.includes(tok.op)) return left;
      this.pos += 1;
      const right = next();
      left = this.apply(tok.op, left, right);
    }
  }

  private apply(op: Op, left: number, right: number): number {
    switch (op) {
      case "+":
        return left + right;
      case "-":
        return left - right;
      case "*":
        return left * right;
      case "/":
        if (right === 0) throw new EvalError("division by zero");
        return left / right;
      case "%":
        if (right === 0) throw new EvalError("division by zero");
        return left % right;
      case "&":
        return fromBigInt(asBigInt(left, "&") & asBigInt(right, "&"));
      case "|":
        return fromBigInt(asBigInt(left, "|") | asBigInt(right, "|"));
      case "xor":
        return fromBigInt(asBigInt(left, "xor") ^ asBigInt(right, "xor"));
      case "<<":
        return fromBigInt(asBigInt(left, "<<") << asBigInt(right, "<<"));
      case ">>":
        return fromBigInt(asBigInt(left, ">>") >> asBigInt(right, ">>"));
      default:
        throw new EvalError(`unexpected operator "${op}"`);
    }
  }

  private expression(): number {
    return this.binaryLevel(["|"], () =>
      this.binaryLevel(["xor"], () =>
        this.binaryLevel(["&"], () =>
          this.binaryLevel(["<<", ">>"], () =>
            this.binaryLevel(["+", "-"], () =>
              this.binaryLevel(["*", "/", "%"], () => this.unary()),
            ),
          ),
        ),
      ),
    );
  }

  private unary(): number {
    const tok = this.peek();
    if (tok?.kind === "op" && tok.op === "-") {
      this.pos += 1;
      return -this.unary();
    }
    if (tok?.kind === "op" && tok.op === "~") {
      this.pos += 1;
      return fromBigInt(~asBigInt(this.unary(), "~"));
    }
    return this.power();
  }

  private power(): number {
    const base = this.postfix();
    const tok = this.peek();
    if (tok?.kind === "op" && tok.op === "^") {
      this.pos += 1;
      // Right-associative: 2^3^2 = 2^(3^2) = 512.
      return base ** this.unary();
    }
    return base;
  }

  private postfix(): number {
    let value = this.primary();
    while (
      this.peek()?.kind === "op" &&
      (this.peek() as { op: Op }).op === "!"
    ) {
      this.pos += 1;
      value = factorial(value);
    }
    return value;
  }

  private primary(): number {
    const tok = this.peek();
    if (tok === undefined) throw new EvalError("unexpected end of expression");
    if (tok.kind === "number") {
      this.pos += 1;
      return tok.value;
    }
    if (tok.kind === "func") {
      this.pos += 1;
      if (this.peek()?.kind !== "lparen") {
        throw new EvalError(`${tok.name} needs parentheses`);
      }
      this.pos += 1;
      const arg = this.expression();
      if (this.peek()?.kind !== "rparen") {
        throw new EvalError("missing closing parenthesis");
      }
      this.pos += 1;
      const value = FUNCTIONS[tok.name](arg);
      if (Number.isNaN(value)) {
        throw new EvalError(`${tok.name} is undefined there`);
      }
      return value;
    }
    if (tok.kind === "lparen") {
      this.pos += 1;
      const value = this.expression();
      if (this.peek()?.kind !== "rparen") {
        throw new EvalError("missing closing parenthesis");
      }
      this.pos += 1;
      return value;
    }
    throw new EvalError("expected a number or parenthesis");
  }
}

// Evaluate an infix expression. Throws EvalError on malformed input,
// division by zero, or a non-finite result (overflow).
export function evaluate(expression: string): number {
  const value = new Parser(tokenize(expression)).parse();
  if (!Number.isFinite(value)) throw new EvalError("result is not finite");
  return value;
}

// Format a result for the display and the tape. Rounds away binary-float
// noise (0.1 + 0.2 → "0.3") while keeping up to 12 significant digits.
export function formatResult(value: number): string {
  if (Number.isInteger(value) && Math.abs(value) < 1e15) {
    return String(value);
  }
  const rounded = Number.parseFloat(value.toPrecision(12));
  return String(rounded);
}

// Hex rendering for the programmer mode's secondary result line. Null for
// non-integers (there is no honest hex spelling to show).
export function formatHex(value: number): string | null {
  if (!Number.isInteger(value)) return null;
  const negative = value < 0;
  return `${negative ? "-" : ""}0x${Math.abs(value).toString(16).toUpperCase()}`;
}

// True when the expression evaluates cleanly — used for the live preview and
// to gate the `=` key.
export function isEvaluable(expression: string): boolean {
  try {
    evaluate(expression);
    return true;
  } catch {
    return false;
  }
}
