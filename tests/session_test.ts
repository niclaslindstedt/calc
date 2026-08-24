// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  appendEntry,
  isDiscardable,
  newSession,
  nextSessionTitle,
  removeEntry,
  sessionTitle,
  setEntryNote,
} from "../src/app/session.ts";

describe("session model", () => {
  it("logs entries with a timestamp and bumps updatedAt", () => {
    const s0 = newSession(1000);
    const s1 = appendEntry(s0, "1+1", "2", 2000);
    expect(s1.entries).toHaveLength(1);
    expect(s1.entries[0].expression).toBe("1+1");
    expect(s1.entries[0].at).toBe(2000);
    expect(s1.updatedAt).toBe(2000);
    // Pure: the original is untouched.
    expect(s0.entries).toHaveLength(0);
  });

  it("sets and clears entry notes", () => {
    const s = appendEntry(newSession(0), "2*3", "6", 1);
    const id = s.entries[0].id;
    const noted = setEntryNote(s, id, "  six  ", 2);
    expect(noted.entries[0].note).toBe("six");
    const cleared = setEntryNote(noted, id, "   ", 3);
    expect(cleared.entries[0].note).toBeUndefined();
  });

  it("removes entries", () => {
    const s = appendEntry(newSession(0), "2*3", "6", 1);
    expect(removeEntry(s, s.entries[0].id, 2).entries).toHaveLength(0);
  });

  it("keeps the mode a new session was opened in", () => {
    expect(newSession(0).mode).toBe("basic");
    expect(newSession(0, "scientific").mode).toBe("scientific");
  });
});

describe("titles", () => {
  it("falls back to a display title without storing it", () => {
    const s = newSession(0);
    expect(s.title).toBe("");
    expect(sessionTitle(s)).toBe("Untitled session");
  });

  it("suggests numbered titles that skip existing ones", () => {
    expect(nextSessionTitle([])).toBe("Session");
    const s1 = { ...newSession(0), title: "Session" };
    expect(nextSessionTitle([s1])).toBe("Session 2");
    const s5 = { ...newSession(0), title: "Session 5" };
    expect(nextSessionTitle([s1, s5])).toBe("Session 6");
    const named = { ...newSession(0), title: "Groceries" };
    expect(nextSessionTitle([named])).toBe("Session");
  });
});

describe("isDiscardable", () => {
  it("discards only an untouched scratch tape", () => {
    const s = newSession(0);
    expect(isDiscardable(s)).toBe(true);
    expect(isDiscardable({ ...s, title: "Named" })).toBe(false);
    expect(isDiscardable(appendEntry(s, "1", "1", 1))).toBe(false);
  });
});
