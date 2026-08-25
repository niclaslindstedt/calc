// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// Calculator modes (layouts). A mode is a keypad definition: which keys it
// shows and how many columns they flow into. Every mode feeds the same
// evaluator grammar, so an expression logged in one mode re-evaluates
// identically in another — the mode is presentation, not semantics. Each
// session remembers the mode it last used (`mode:` in its front matter) and
// resumes with it when reopened.
//
// Keys marked `optional` can be hidden per mode in Settings → Layouts, so a
// user can trim buttons they never press; the grid re-flows around them.

// Built-in layout ids. A mode id in the rest of the app is a plain string:
// one of these, or the id of a user-defined custom mode (see CustomMode).
export type BuiltinModeId = "basic" | "scientific" | "programmer";

export type ModeId = string;

export const BUILTIN_MODE_IDS: readonly BuiltinModeId[] = [
  "basic",
  "scientific",
  "programmer",
];

export const DEFAULT_MODE: ModeId = "basic";

export function isBuiltinModeId(value: unknown): value is BuiltinModeId {
  return value === "basic" || value === "scientific" || value === "programmer";
}

// A user-defined mode: a base layout under a new name. Which of the base's
// keys it hides lives in the settings' shared `hiddenKeys` map (keyed by the
// custom mode's id), same as the per-mode customization of built-ins — so
// "create a mode" is: pick a base, press the buttons you want gone, name it.
export type CustomMode = {
  id: string;
  name: string;
  baseId: BuiltinModeId;
};

export type KeyTone = "digit" | "op" | "fn" | "muted" | "accent";

export type KeyDef = {
  id: string;
  label: string;
  // Text appended to the expression. `()` is the smart-paren key; absent for
  // action keys.
  input?: string;
  // `clear` is the erase key, and it reads the display: with characters typed
  // it is a backspace (long press wipes them all), and once the display is
  // empty it is `C` (an inert tap; long press clears the tape). See
  // CalculatorScreen for the dispatch and Keypad for the face it wears.
  action?: "clear" | "equals";
  tone?: KeyTone;
  // Grid columns this key spans (default 1).
  span?: number;
  // Hideable in Settings → Layouts.
  optional?: boolean;
};

export type Mode = {
  id: ModeId;
  name: string;
  // Short label for the top-bar mode switch.
  shortName: string;
  columns: number;
  keys: KeyDef[];
  // Show the result's hex spelling under the preview (programmer mode).
  hexPreview?: boolean;
};

export function parseCustomModes(raw: unknown): CustomMode[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (m): m is CustomMode =>
      typeof m === "object" &&
      m !== null &&
      typeof (m as CustomMode).id === "string" &&
      typeof (m as CustomMode).name === "string" &&
      isBuiltinModeId((m as CustomMode).baseId),
  );
}

// The one erase key every layout carries. It labels itself `C` or `⌫`
// depending on whether anything has been typed — see the `action` note above.
const CLEAR: KeyDef = {
  id: "clear",
  label: "C",
  action: "clear",
  tone: "muted",
};
const EQUALS: KeyDef = {
  id: "equals",
  label: "=",
  action: "equals",
  tone: "accent",
};
const PARENS: KeyDef = {
  id: "parens",
  label: "( )",
  input: "()",
  tone: "muted",
  optional: true,
};

function digit(d: string): KeyDef {
  return { id: `d${d}`, label: d, input: d, tone: "digit" };
}

const BASIC: Mode = {
  id: "basic",
  name: "Basic",
  shortName: "123",
  columns: 4,
  keys: [
    CLEAR,
    PARENS,
    { id: "mod", label: "%", input: "%", tone: "muted", optional: true },
    { id: "div", label: "÷", input: "÷", tone: "op" },
    digit("7"),
    digit("8"),
    digit("9"),
    { id: "mul", label: "×", input: "×", tone: "op" },
    digit("4"),
    digit("5"),
    digit("6"),
    { id: "sub", label: "−", input: "−", tone: "op" },
    digit("1"),
    digit("2"),
    digit("3"),
    { id: "add", label: "+", input: "+", tone: "op" },
    { ...digit("0"), span: 2 },
    { id: "dot", label: ".", input: ".", tone: "digit" },
    EQUALS,
  ],
};

const SCIENTIFIC: Mode = {
  id: "scientific",
  name: "Scientific",
  shortName: "sin",
  columns: 5,
  keys: [
    { id: "sin", label: "sin", input: "sin(", tone: "fn", optional: true },
    { id: "cos", label: "cos", input: "cos(", tone: "fn", optional: true },
    { id: "tan", label: "tan", input: "tan(", tone: "fn", optional: true },
    { id: "ln", label: "ln", input: "ln(", tone: "fn", optional: true },
    { id: "log", label: "log", input: "log(", tone: "fn", optional: true },
    { id: "sqrt", label: "√", input: "sqrt(", tone: "fn", optional: true },
    { id: "pow", label: "xʸ", input: "^", tone: "fn", optional: true },
    { id: "fact", label: "n!", input: "!", tone: "fn", optional: true },
    { id: "pi", label: "π", input: "π", tone: "fn", optional: true },
    { id: "econst", label: "e", input: "e", tone: "fn", optional: true },
    { ...CLEAR, span: 2 },
    { ...PARENS, span: 2 },
    { id: "mod", label: "%", input: "%", tone: "muted", optional: true },
    digit("7"),
    digit("8"),
    digit("9"),
    { id: "div", label: "÷", input: "÷", tone: "op" },
    { id: "mul", label: "×", input: "×", tone: "op" },
    digit("4"),
    digit("5"),
    digit("6"),
    { id: "sub", label: "−", input: "−", tone: "op" },
    { id: "add", label: "+", input: "+", tone: "op" },
    digit("1"),
    digit("2"),
    digit("3"),
    { id: "dot", label: ".", input: ".", tone: "digit" },
    { id: "abs", label: "|x|", input: "abs(", tone: "fn", optional: true },
    { ...digit("0"), span: 2 },
    { ...EQUALS, span: 3 },
  ],
};

const PROGRAMMER: Mode = {
  id: "programmer",
  name: "Programmer",
  shortName: "0x",
  columns: 5,
  hexPreview: true,
  keys: [
    { id: "and", label: "&", input: "&", tone: "fn", optional: true },
    { id: "or", label: "|", input: "|", tone: "fn", optional: true },
    { id: "xor", label: "xor", input: " xor ", tone: "fn", optional: true },
    { id: "not", label: "~", input: "~", tone: "fn", optional: true },
    { id: "shl", label: "<<", input: "<<", tone: "fn", optional: true },
    { id: "hexlit", label: "0x", input: "0x", tone: "fn", optional: true },
    { id: "hexA", label: "A", input: "A", tone: "fn", optional: true },
    { id: "hexB", label: "B", input: "B", tone: "fn", optional: true },
    { id: "hexC", label: "C", input: "C", tone: "fn", optional: true },
    { id: "shr", label: ">>", input: ">>", tone: "fn", optional: true },
    { id: "binlit", label: "0b", input: "0b", tone: "fn", optional: true },
    { id: "hexD", label: "D", input: "D", tone: "fn", optional: true },
    { id: "hexE", label: "E", input: "E", tone: "fn", optional: true },
    { id: "hexF", label: "F", input: "F", tone: "fn", optional: true },
    { id: "mod", label: "%", input: "%", tone: "muted", optional: true },
    digit("7"),
    digit("8"),
    digit("9"),
    { id: "div", label: "÷", input: "÷", tone: "op" },
    { id: "mul", label: "×", input: "×", tone: "op" },
    digit("4"),
    digit("5"),
    digit("6"),
    { id: "sub", label: "−", input: "−", tone: "op" },
    { id: "add", label: "+", input: "+", tone: "op" },
    digit("1"),
    digit("2"),
    digit("3"),
    { ...PARENS, span: 2 },
    { ...digit("0"), span: 2 },
    CLEAR,
    { ...EQUALS, span: 2 },
  ],
};

export const MODES: Record<BuiltinModeId, Mode> = {
  basic: BASIC,
  scientific: SCIENTIFIC,
  programmer: PROGRAMMER,
};

// Resolve any mode id — built-in or custom — to its layout. A custom mode is
// its base layout wearing the user's name (the trimmed keys come from the
// shared hiddenKeys map at render time). Unknown ids resolve to null; callers
// fall back to the basic mode so a session saved under a since-deleted custom
// mode still opens.
export function resolveMode(
  id: ModeId,
  customModes: readonly CustomMode[],
): Mode | null {
  if (isBuiltinModeId(id)) return MODES[id];
  const custom = customModes.find((m) => m.id === id);
  if (!custom) return null;
  const base = MODES[custom.baseId];
  return {
    ...base,
    id: custom.id,
    name: custom.name,
    shortName: custom.name.slice(0, 4),
  };
}

// The keys a mode shows once the user's hidden set is applied. Non-optional
// keys are always kept, so the core of every layout survives customization.
export function visibleKeys(mode: Mode, hidden: readonly string[]): KeyDef[] {
  return mode.keys.filter((k) => !k.optional || !hidden.includes(k.id));
}

// A key with the width it actually occupies once the layout is packed.
export type PlacedKey = KeyDef & { span: number };

// Pack a mode into rows of exactly `columns` width.
//
// Rows come from the layout as authored — the packing runs over the mode's
// full key list — and hiding a key (Settings → Layouts) removes it from *its*
// row, widening what's left to close the gap. Keeping the authored rows is
// what stops a trim from shuffling the whole pad diagonally: hide `n!` and the
// function row's remaining keys grow, while `7 8 9 ÷ ×` stays put. It also
// means `=` can never be stranded alone next to four empty columns — a row
// that loses everything else simply hands its width to the survivor.
export function layoutRows(
  mode: Mode,
  hidden: readonly string[] = [],
): PlacedKey[][] {
  const { columns } = mode;
  const span = (key: KeyDef) => Math.min(Math.max(key.span ?? 1, 1), columns);

  // 1. Rows as authored.
  const authored: KeyDef[][] = [];
  let row: KeyDef[] = [];
  let used = 0;
  for (const key of mode.keys) {
    if (used + span(key) > columns) {
      authored.push(row);
      row = [];
      used = 0;
    }
    row.push(key);
    used += span(key);
  }
  if (row.length > 0) authored.push(row);

  // 2. Drop the hidden keys and widen the rest back out to the full grid,
  //    growing from the right so the leading keys keep their size.
  const rows: PlacedKey[][] = [];
  for (const source of authored) {
    const kept = source
      .filter((key) => !key.optional || !hidden.includes(key.id))
      .map((key) => ({ ...key, span: span(key) }));
    if (kept.length === 0) continue;
    let leftover = columns - kept.reduce((sum, key) => sum + key.span, 0);
    for (
      let i = kept.length - 1;
      leftover > 0;
      i = i === 0 ? kept.length - 1 : i - 1
    ) {
      kept[i].span += 1;
      leftover -= 1;
    }
    rows.push(kept);
  }

  return rows;
}
