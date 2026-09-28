// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
// The phone app's icon is opaque: the App Store refuses an app icon with an
// alpha channel, even one where every pixel is solid. `make icons` writes it
// as an RGB PNG (`scripts/generate-icons.mjs`); this pins the file it wrote.

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const icon = readFileSync(
  join(import.meta.dirname, "..", "native", "assets", "icon.png"),
);

/** The PNG's chunk types, in order, up to the image data. */
function chunks(png: Buffer): string[] {
  const out: string[] = [];
  for (let at = 8; at + 8 <= png.length;) {
    const length = png.readUInt32BE(at);
    const type = png.toString("ascii", at + 4, at + 8);
    out.push(type);
    if (type === "IDAT") break;
    at += 12 + length;
  }
  return out;
}

describe("the phone app's icon", () => {
  it("is a 1024 px square PNG", () => {
    expect(icon.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(icon.readUInt32BE(16)).toBe(1024);
    expect(icon.readUInt32BE(20)).toBe(1024);
  });

  it("has no alpha channel and no transparency chunk", () => {
    // IHDR colour type: 2 is RGB; 4 and 6 carry alpha.
    expect(icon[25]).toBe(2);
    expect(chunks(icon)).not.toContain("tRNS");
  });
});
