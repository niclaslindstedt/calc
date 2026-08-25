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
          ["clear", "equals", "backspace"].includes(key.id) ||
            key.tone === "digit" ||
            key.tone === "op",
        ).toBe(true);
      }
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
  const rowWidths = (rows: ReturnType<typeof layoutRows>) =>
    rows.map((row) => row.reduce((sum, key) => sum + key.span, 0));

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
    }
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
