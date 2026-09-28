// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The demo shelf is the live demo and what the store screenshots photograph,
// so it is held to what a reader would notice first: arithmetic the app would
// not have done, a tape that reads as scratch rather than as work, and a file
// the app itself could not have written.

import {
  closeParens,
  evaluate,
  formatResult,
} from "@niclaslindstedt/oss-framework/expression";
import { describe, expect, it } from "vitest";

import {
  parseFolders,
  parseSessionMarkdown,
  sessionToMarkdown,
} from "../src/app/codec.ts";
import { demoFiles, memoryFileStore } from "../src/app/dev/demo.ts";
import {
  buildDemoSessions,
  DEMO_FOLDERS,
  lastMonthName,
} from "../src/app/dev/demoData.ts";
import { isBuiltinModeId } from "../src/app/modes.ts";
import { sessionToResume } from "../src/app/session.ts";
import { createSessionStore } from "../src/app/store.ts";

const NOW = Date.parse("2026-09-26T10:30:00.000Z");
const sessions = buildDemoSessions(NOW);

describe("demo shelf", () => {
  it("is the same shelf for the same moment", () => {
    expect(buildDemoSessions(NOW)).toEqual(sessions);
  });

  it("carries only results the evaluator gives", () => {
    for (const session of sessions) {
      for (const entry of session.entries) {
        const again = formatResult(evaluate(closeParens(entry.expression)));
        expect(entry.result, `${session.title}: ${entry.expression}`).toBe(
          again,
        );
      }
    }
  });

  it("chains only from the result above", () => {
    for (const session of sessions) {
      session.entries.forEach((entry, i) => {
        if (!entry.chained) return;
        expect(i).toBeGreaterThan(0);
        expect(entry.expression.startsWith(session.entries[i - 1].result)).toBe(
          true,
        );
      });
    }
  });

  it("reads as work: named, noted, short, and in the past", () => {
    const ids = new Set<string>();
    for (const session of sessions) {
      expect(session.title.trim()).not.toBe("");
      expect(ids.has(session.id)).toBe(false);
      ids.add(session.id);
      expect(isBuiltinModeId(session.mode)).toBe(true);
      // Short enough to take in at a glance on a phone.
      expect(session.entries.length).toBeGreaterThanOrEqual(3);
      expect(session.entries.length).toBeLessThanOrEqual(8);
      for (const entry of session.entries) {
        expect(entry.note?.trim(), entry.expression).toBeTruthy();
        // A note is a line under a row, not a paragraph.
        expect(entry.note!.length).toBeLessThanOrEqual(40);
        expect(entry.at).toBeLessThan(NOW);
        // A screenshot must not show a result the display cuts off.
        expect(entry.result.length).toBeLessThanOrEqual(14);
      }
      if (session.folderId) {
        expect(DEMO_FOLDERS.some((f) => f.id === session.folderId)).toBe(true);
      }
    }
    // Every mode the app ships is on the shelf.
    expect(new Set(sessions.map((s) => s.mode))).toEqual(
      new Set(["basic", "scientific", "programmer"]),
    );
  });

  it("opens on the kitchen floor", () => {
    const blank = { ...sessions[0], id: "blank", title: "", entries: [] };
    expect(sessionToResume("empty", blank, sessions)?.title).toBe(
      "Kitchen floor",
    );
  });

  it("is files the app itself would write", () => {
    for (const session of sessions) {
      const text = sessionToMarkdown(session);
      const parsed = parseSessionMarkdown(text);
      expect(parsed).not.toBeNull();
      expect(sessionToMarkdown(parsed!)).toBe(text);
    }
    const files = demoFiles(NOW);
    expect(parseFolders(files.get("calculations/folders.json")!)).toEqual(
      DEMO_FOLDERS,
    );
  });

  it("lists through the real session store, folders and all", async () => {
    const store = createSessionStore(
      memoryFileStore(demoFiles(NOW)),
      "default",
    );
    const listed = await store.list();
    expect(listed.sessions.map((s) => s.title)).toEqual(
      sessions.map((s) => s.title),
    );
    expect(listed.folders).toEqual(DEMO_FOLDERS);
  });
});

describe("demo shelf, on every day of a year", () => {
  // The shelf is built from the moment it is read, so a screenshot taken on
  // any day — early, late, across a clock change — has to show the same
  // shelf. Walk a whole year, several times a day, and hold each premise the
  // frames rest on.
  const HOURS: [number, number][] = [
    [0, 5],
    [6, 30],
    [9, 13],
    [12, 0],
    [18, 45],
    [23, 55],
  ];
  const moments: number[] = [];
  for (let day = 0; day < 366; day++) {
    for (const [h, m] of HOURS) {
      moments.push(new Date(2027, 0, 1 + day, h, m).getTime());
    }
  }

  it("walks a whole year", () => {
    expect(new Date(moments[0]).getFullYear()).toBe(2027);
    expect(new Date(moments[moments.length - 1]).getFullYear()).toBe(2028);
  });

  it("writes nothing after the moment it is read", () => {
    for (const now of moments) {
      for (const session of buildDemoSessions(now)) {
        expect(session.updatedAt, new Date(now).toString()).toBeLessThan(now);
        session.entries.forEach((entry, i) => {
          expect(entry.at).toBeLessThan(now);
          if (i > 0) {
            expect(entry.at).toBeGreaterThan(session.entries[i - 1].at);
          }
        });
      }
    }
  });

  it("lists newest first and opens on the kitchen floor", () => {
    for (const now of moments) {
      const shelf = buildDemoSessions(now);
      const at = new Date(now).toString();
      for (let i = 1; i < shelf.length; i++) {
        expect(shelf[i].updatedAt, at).toBeLessThan(shelf[i - 1].updatedAt);
      }
      const blank = { ...shelf[0], id: "blank", title: "", entries: [] };
      expect(sessionToResume("empty", blank, shelf)?.title, at).toBe(
        "Kitchen floor",
      );
    }
  });

  it("keeps the kitchen floor within the last day, and the rest this month", () => {
    const DAY = 24 * 60 * 60 * 1000;
    for (const now of moments) {
      const shelf = buildDemoSessions(now);
      expect(now - shelf[0].updatedAt).toBeLessThan(DAY);
      for (const session of shelf) {
        expect(now - session.createdAt).toBeLessThan(31 * DAY);
      }
    }
  });

  it("names the invoice's month from the day, never a fixed one", () => {
    const months = new Set<string>();
    for (const now of moments) {
      const invoice = buildDemoSessions(now).find((s) =>
        s.title.startsWith("Invoice — "),
      );
      expect(invoice, new Date(now).toString()).toBeDefined();
      const month = lastMonthName(new Date(invoice!.createdAt));
      expect(invoice!.title).toBe(`Invoice — ${month}`);
      months.add(month);
    }
    // Across a year it has named every month.
    expect(months.size).toBe(12);
  });

  it("carries the same tapes whatever the day", () => {
    const strip = (now: number) =>
      buildDemoSessions(now).map((s) => ({
        // The invoice's month moves with the day (the test above); the rest
        // of every title is fixed.
        title: s.title.replace(/^Invoice — \w+$/, "Invoice — <month>"),
        mode: s.mode,
        folderId: s.folderId,
        entries: s.entries.map(({ expression, result, note, starred }) => ({
          expression,
          result,
          note,
          starred,
        })),
      }));
    const first = strip(moments[0]);
    for (const now of moments) expect(strip(now)).toEqual(first);
  });
});
