// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  BUILTIN_MODE_IDS,
  MODES,
  layoutRows,
  parseCustomModes,
  resolveMode,
  visibleKeys,
  type CustomMode,
} from "../src/app/modes.ts";

describe("built-in modes", () => {
  it("defines the three layouts with unique key ids", () => {
    for (const id of BUILTIN_MODE_IDS) {
      const mode = MODES[id];
      const ids = mode.keys.map((k) => k.id);
      expect(new Set(ids).size).toBe(ids.length);
      // Every layout keeps the required core.
      expect(ids).toContain("equals");
      expect(ids).toContain("clear");
      expect(ids).toContain("d0");
    }
  });

  it("keeps required keys out of the hideable set", () => {
    for (const id of BUILTIN_MODE_IDS) {
      const required = MODES[id].keys.filter((k) => !k.optional);
      for (const key of required) {
        expect(
          ["clear", "equals"].includes(key.id) ||
            key.tone === "digit" ||
            key.tone === "op",
        ).toBe(true);
      }
    }
  });

  it("gives every layout exactly one erase key", () => {
    for (const id of BUILTIN_MODE_IDS) {
      const erase = MODES[id].keys.filter((k) => k.action === "clear");
      // `C` covers backspace (tap) and clear (hold), so a second erase key
      // would just be the same gesture twice.
      expect({ id, count: erase.length }).toEqual({ id, count: 1 });
      expect(erase[0].optional).toBeUndefined();
    }
  });
});

describe("visibleKeys", () => {
  it("hides only optional keys", () => {
    const mode = MODES.basic;
    const keys = visibleKeys(mode, ["mod", "equals"]);
    expect(keys.some((k) => k.id === "mod")).toBe(false);
    // equals is not optional, so it survives the hidden list.
    expect(keys.some((k) => k.id === "equals")).toBe(true);
  });
});

describe("custom modes", () => {
  const custom: CustomMode = {
    id: "c-1",
    name: "My keys",
    baseId: "programmer",
  };

  it("resolves a custom mode to its base layout under the new name", () => {
    const mode = resolveMode("c-1", [custom]);
    expect(mode?.name).toBe("My keys");
    expect(mode?.id).toBe("c-1");
    expect(mode?.keys).toBe(MODES.programmer.keys);
    expect(mode?.hexPreview).toBe(true);
  });

  it("resolves built-ins directly and unknown ids to null", () => {
    expect(resolveMode("basic", [])).toBe(MODES.basic);
    expect(resolveMode("c-gone", [])).toBeNull();
  });

  it("parses only structurally valid custom modes", () => {
    expect(parseCustomModes([custom, { id: "x" }, null, 5])).toEqual([custom]);
    expect(parseCustomModes("nope")).toEqual([]);
  });
});

describe("layoutRows", () => {
  // What each row actually claims of the grid: its own keys, plus the columns
  // a tall key from a row above is still holding.
  const rowWidths = (rows: ReturnType<typeof layoutRows>) => {
    const carried: number[] = [];
    return rows.map((row, i) => {
      const width = row.reduce((sum, key) => sum + key.span, carried[i] ?? 0);
      for (const key of row) {
        for (let r = 1; r < key.rowSpan; r += 1) {
          carried[i + r] = (carried[i + r] ?? 0) + key.span;
        }
      }
      return width;
    });
  };

  it("flows every built-in layout into full rows as authored", () => {
    for (const id of BUILTIN_MODE_IDS) {
      const mode = MODES[id];
      const rows = layoutRows(mode);
      // No widening should be needed for a layout as it ships, so the pad
      // reads as designed before any customization.
      expect({ id, widths: rowWidths(rows) }).toEqual({
        id,
        widths: rows.map(() => mode.columns),
      });
      expect(rows.flat().map((k) => k.span)).toEqual(
        mode.keys.map((k) => k.span ?? 1),
      );
      expect(rows.flat().map((k) => k.rowSpan)).toEqual(
        mode.keys.map((k) => k.rowSpan ?? 1),
      );
    }
  });

  it("lays the basic pad out as the six rows it is drawn in", () => {
    expect(layoutRows(MODES.basic).map((row) => row.map((k) => k.id))).toEqual([
      ["neg", "lparen", "rparen", "sqrt"],
      ["d7", "d8", "d9", "div"],
      ["d4", "d5", "d6", "mul"],
      ["d1", "d2", "d3", "sub"],
      ["d0", "dot", "mod", "add"],
      ["clear", "equals"],
    ]);
  });

  it("packs a row around the tall key reaching into it", () => {
    const rows = layoutRows(MODES.basic);
    const tall = rows[4].find((k) => k.id === "add");
    expect(tall?.rowSpan).toBe(2);
    // `+` holds the fourth column of the bottom row, so erase and `=` have
    // three columns between them rather than four.
    expect(rows[5].map((k) => k.span)).toEqual([1, 2]);
  });

  it("never widens a tall key when its row is trimmed", () => {
    // `%` leaves the row `+` is drawn tall in; growing `+` would take a column
    // out of the bottom row, which is already packed against it.
    const rows = layoutRows(MODES.basic, ["mod"]);
    expect(rows[4].map((k) => [k.id, k.span])).toEqual([
      ["d0", 1],
      ["dot", 2],
      ["add", 1],
    ]);
    expect(rows[5].map((k) => [k.id, k.span])).toEqual([
      ["clear", 1],
      ["equals", 2],
    ]);
  });

  it("never leaves `=` alone on a narrow row", () => {
    for (const id of BUILTIN_MODE_IDS) {
      const mode = MODES[id];
      for (const trim of [
        [],
        mode.keys.filter((k) => k.optional).map((k) => k.id),
      ]) {
        const rows = layoutRows(mode, trim);
        const row = rows.find((r) => r.some((k) => k.id === "equals"));
        expect(row).toBeDefined();
        const equals = row?.find((k) => k.id === "equals");
        // Either `=` shares its row, or it spans the pad's full width.
        if (row?.length === 1) expect(equals?.span).toBe(mode.columns);
      }
    }
  });

  it("keeps rows full for every single-key trim of every layout", () => {
    for (const id of BUILTIN_MODE_IDS) {
      const mode = MODES[id];
      for (const hidden of mode.keys.filter((k) => k.optional)) {
        const rows = layoutRows(mode, [hidden.id]);
        expect({ id, hidden: hidden.id, widths: rowWidths(rows) }).toEqual({
          id,
          hidden: hidden.id,
          widths: rows.map(() => mode.columns),
        });
      }
    }
  });

  it("holds the untouched rows in place when a key is hidden", () => {
    const mode = MODES.scientific;
    const before = layoutRows(mode).map((row) => row.map((k) => k.id));
    const after = layoutRows(mode, ["fact"]).map((row) => row.map((k) => k.id));
    // `n!` leaves the function row; every other row is untouched, so the
    // digits don't shuffle across the pad under a trim.
    expect(after.filter((row) => !row.includes("sqrt"))).toEqual(
      before.filter((row) => !row.includes("sqrt")),
    );
    expect(after.find((row) => row.includes("sqrt"))).not.toContain("fact");
  });

  it("widens the survivors of a trimmed row from the right", () => {
    const mode = MODES.scientific;
    const rows = layoutRows(mode, ["fact"]);
    const fnRow = rows.find((row) => row.some((k) => k.id === "sqrt"));
    expect(fnRow?.map((k) => k.span)).toEqual([1, 1, 1, 2]);
  });

  it("drops a row whose keys are all hidden", () => {
    const mode = MODES.scientific;
    const trig = ["sin", "cos", "tan", "ln", "log"];
    const rows = layoutRows(mode, trig);
    expect(rows.flat().some((k) => trig.includes(k.id))).toBe(false);
    expect(rowWidths(rows)).toEqual(rows.map(() => mode.columns));
  });
});
