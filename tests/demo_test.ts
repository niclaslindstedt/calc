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
import { buildDemoSessions, DEMO_FOLDERS } from "../src/app/dev/demoData.ts";
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
