// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  appendEntry,
  clearEntries,
  isDiscardable,
  newSession,
  nextSessionTitle,
  removeEntry,
  sessionTitle,
  setEntryNote,
  toggleEntryStar,
} from "../src/app/session.ts";

describe("session model", () => {
  it("logs entries with a timestamp and bumps updatedAt", () => {
    const s0 = newSession(1000);
    const s1 = appendEntry(s0, "1+1", "2", { now: 2000 });
    expect(s1.entries).toHaveLength(1);
    expect(s1.entries[0].expression).toBe("1+1");
    expect(s1.entries[0].at).toBe(2000);
    expect(s1.updatedAt).toBe(2000);
    // Pure: the original is untouched.
    expect(s0.entries).toHaveLength(0);
  });

  it("sets and clears entry notes", () => {
    const s = appendEntry(newSession(0), "2*3", "6", { now: 1 });
    const id = s.entries[0].id;
    const noted = setEntryNote(s, id, "  six  ", 2);
    expect(noted.entries[0].note).toBe("six");
    const cleared = setEntryNote(noted, id, "   ", 3);
    expect(cleared.entries[0].note).toBeUndefined();
  });

  it("marks a chained entry only when told to", () => {
    const plain = appendEntry(newSession(0), "1+1", "2", { now: 1 });
    expect(plain.entries[0].chained).toBeUndefined();
    const chained = appendEntry(plain, "2*3", "6", { now: 2, chained: true });
    expect(chained.entries[1].chained).toBe(true);
  });

  it("toggles an entry's star off and on", () => {
    const s = appendEntry(newSession(0), "2*3", "6", { now: 1 });
    const id = s.entries[0].id;
    const starred = toggleEntryStar(s, id, 2);
    expect(starred.entries[0].starred).toBe(true);
    expect(starred.updatedAt).toBe(2);
    expect(toggleEntryStar(starred, id, 3).entries[0].starred).toBeUndefined();
  });

  it("removes entries", () => {
    const s = appendEntry(newSession(0), "2*3", "6", { now: 1 });
    expect(removeEntry(s, s.entries[0].id, 2).entries).toHaveLength(0);
  });

  it("clears every entry but keeps the session", () => {
    let s = { ...newSession(0), title: "Budget", mode: "scientific" };
    s = appendEntry(s, "2*3", "6", { now: 1 });
    s = appendEntry(s, "6+1", "7", { now: 2 });
    const cleared = clearEntries(s, 3);
    expect(cleared.entries).toEqual([]);
    expect(cleared.title).toBe("Budget");
    expect(cleared.mode).toBe("scientific");
    expect(cleared.id).toBe(s.id);
    expect(cleared.updatedAt).toBe(3);
  });

  it("leaves an already empty tape untouched", () => {
    const s = newSession(0);
    expect(clearEntries(s, 9)).toBe(s);
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
    expect(isDiscardable(appendEntry(s, "1", "1", { now: 1 }))).toBe(false);
  });
});
