// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import { cacheIdForBase } from "../src/app/pwa.ts";

describe("cacheIdForBase", () => {
  it("derives a distinct cache id per deploy channel", () => {
    expect(cacheIdForBase("/")).toBe("calc");
    expect(cacheIdForBase("/preview/")).toBe("calc-preview");
    expect(cacheIdForBase("/branch/feat-x/")).toBe("calc-branch-feat-x");
  });
});
