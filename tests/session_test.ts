// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  appendEntry,
  clearEntries,
  isDiscardable,
  isNamed,
  newSession,
  removeEntry,
  repeatedEntry,
  sessionTitle,
  sessionToResume,
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

  it("counts a session as named — and so as saved — only with a real title", () => {
    const s = newSession(0);
    expect(isNamed(s)).toBe(false);
    expect(isNamed({ ...s, title: "   " })).toBe(false);
    expect(isNamed({ ...s, title: "Groceries" })).toBe(true);
    // A tape with entries is still unnamed until it is given a title.
    expect(isNamed(appendEntry(s, "1+1", "2", { now: 1 }))).toBe(false);
  });
});

describe("isDiscardable", () => {
  it("discards only an untouched scratch tape", () => {
    const s = newSession(0);
    expect(isDiscardable(s)).toBe(true);
    expect(isDiscardable({ ...s, title: "Named" })).toBe(false);
    expect(isDiscardable(appendEntry(s, "1", "1", { now: 1 }))).toBe(false);
  });

  it("spots the entry a held `=` would restate", () => {
    const s = appendEntry(newSession(0), "12+3", "15", { now: 1 });
    // `=` seeds the display with the result; pressing it again re-evaluates
    // that seed and lands on the same answer.
    expect(repeatedEntry(s, "15", "15")).toBe(s.entries[0]);
    // The same calculation typed out again is the same restatement.
    expect(repeatedEntry(s, "12+3", "15")).toBe(s.entries[0]);
  });

  it("lets a calculation that says something new through", () => {
    const s = appendEntry(newSession(0), "12+3", "15", { now: 1 });
    expect(repeatedEntry(s, "15+1", "16")).toBeNull();
    // Same expression, different answer (a mode change, say) still logs.
    expect(repeatedEntry(s, "12+3", "16")).toBeNull();
    // A different expression that happens to land on the same answer is a
    // calculation of its own.
    expect(repeatedEntry(s, "10+5", "15")).toBeNull();
    // Only the last entry counts — an older twin does not silence a repeat.
    const later = appendEntry(s, "2*2", "4", { now: 2 });
    expect(repeatedEntry(later, "15", "15")).toBeNull();
  });

  it("has nothing to restate on an empty tape", () => {
    expect(repeatedEntry(newSession(0), "15", "15")).toBeNull();
  });
});

describe("sessionToResume", () => {
  // Three saved sessions, deliberately not in updatedAt order: the pick is by
  // recency, not by list position.
  const older = {
    ...appendEntry(newSession(0), "1+1", "2", { now: 10 }),
    title: "Older",
  };
  const latest = {
    ...appendEntry(newSession(0), "2+2", "4", { now: 30 }),
    title: "Latest",
  };
  const middle = {
    ...appendEntry(newSession(0), "3+3", "6", { now: 20 }),
    title: "Middle",
  };
  const saved = [older, latest, middle];

  it("opens the most recently updated session when the device has no tape", () => {
    // A reinstall or a new device: the sessions are in the backend, the tape
    // was never on this device.
    expect(sessionToResume("empty", newSession(0), saved)).toBe(latest);
  });

  it("leaves a tape the device resumed alone", () => {
    // A normal launch: the device's tape wins, even if it happens to be blank
    // by the time this runs.
    expect(sessionToResume("tape", newSession(0), saved)).toBeNull();
  });

  it("does not treat an unreadable device as one with no tape", () => {
    expect(sessionToResume("unavailable", newSession(0), saved)).toBeNull();
  });

  it("never replaces a tape the reader has already started", () => {
    // A calculation made before the listing arrived…
    const typed = appendEntry(newSession(0), "7*6", "42", { now: 40 });
    expect(sessionToResume("empty", typed, saved)).toBeNull();
    // …or a title typed into the top bar.
    expect(
      sessionToResume("empty", { ...newSession(0), title: "Rent" }, saved),
    ).toBeNull();
  });

  it("keeps the blank tape when there is nothing saved", () => {
    expect(sessionToResume("empty", newSession(0), [])).toBeNull();
  });
});
