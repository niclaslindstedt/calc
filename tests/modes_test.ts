// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  BUILTIN_MODE_IDS,
  MODES,
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
