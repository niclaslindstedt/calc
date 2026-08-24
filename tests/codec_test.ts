// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
import { describe, expect, it } from "vitest";

import {
  parseFolders,
  parseSessionMarkdown,
  serializeFolders,
  sessionFilePath,
  sessionFileStem,
  sessionToMarkdown,
  slugify,
} from "../src/app/codec.ts";
import type { Folder, Session } from "../src/app/session.ts";

const T0 = Date.parse("2026-08-24T09:00:00.000Z");
const T1 = Date.parse("2026-08-24T09:05:00.000Z");

function sampleSession(): Session {
  return {
    id: "0198c9c9-aaaa-bbbb-cccc-00000a1b2c3d",
    title: "Groceries budget",
    createdAt: T0,
    updatedAt: T1,
    mode: "basic",
    folderId: "f-shopping",
    entries: [
      {
        id: "e1",
        expression: "12 × 4.5",
        result: "54",
        note: "Twelve packs at 4.50 each",
        at: T0,
      },
      { id: "e2", expression: "54 + 12.9", result: "66.9", at: T1 },
    ],
  };
}

describe("sessionToMarkdown", () => {
  it("writes front matter, title heading, and tape bullets", () => {
    const md = sessionToMarkdown(sampleSession());
    expect(md).toBe(
      [
        "---",
        "type: calculation",
        "id: 0198c9c9-aaaa-bbbb-cccc-00000a1b2c3d",
        "created: 2026-08-24T09:00:00.000Z",
        "updated: 2026-08-24T09:05:00.000Z",
        "folder: f-shopping",
        "---",
        "",
        "# Groceries budget",
        "",
        "- `12 × 4.5` = `54` _(at 2026-08-24T09:00:00.000Z)_",
        "  Twelve packs at 4.50 each",
        "- `54 + 12.9` = `66.9` _(at 2026-08-24T09:05:00.000Z)_",
        "",
      ].join("\n"),
    );
  });

  it("writes mode and archived only when off-default", () => {
    const md = sessionToMarkdown({
      ...sampleSession(),
      mode: "scientific",
      archived: true,
    });
    expect(md).toContain("mode: scientific");
    expect(md).toContain("archived: true");
    expect(sessionToMarkdown(sampleSession())).not.toContain("mode:");
  });
});

describe("parseSessionMarkdown", () => {
  it("round-trips serialize → parse → serialize byte-identically", () => {
    const md = sessionToMarkdown(sampleSession());
    const parsed = parseSessionMarkdown(md);
    expect(parsed).not.toBeNull();
    expect(sessionToMarkdown(parsed as Session)).toBe(md);
  });

  it("recovers every field", () => {
    const parsed = parseSessionMarkdown(
      sessionToMarkdown({ ...sampleSession(), mode: "programmer" }),
    );
    expect(parsed?.title).toBe("Groceries budget");
    expect(parsed?.mode).toBe("programmer");
    expect(parsed?.folderId).toBe("f-shopping");
    expect(parsed?.createdAt).toBe(T0);
    expect(parsed?.updatedAt).toBe(T1);
    expect(parsed?.entries).toHaveLength(2);
    expect(parsed?.entries[0].expression).toBe("12 × 4.5");
    expect(parsed?.entries[0].result).toBe("54");
    expect(parsed?.entries[0].note).toBe("Twelve packs at 4.50 each");
    expect(parsed?.entries[0].at).toBe(T0);
    expect(parsed?.entries[1].note).toBeUndefined();
  });

  it("accepts the legacy star-emphasis timestamp marker", () => {
    const parsed = parseSessionMarkdown(
      [
        "---",
        "type: calculation",
        "id: legacy-1",
        "created: 2026-08-24T09:00:00.000Z",
        "updated: 2026-08-24T09:00:00.000Z",
        "---",
        "",
        "- `1+1` = `2` *(at 2026-08-24T09:03:00.000Z)*",
        "",
      ].join("\n"),
    );
    expect(parsed?.entries).toHaveLength(1);
    expect(parsed?.entries[0].at).toBe(Date.parse("2026-08-24T09:03:00.000Z"));
  });

  it("keeps multi-line notes together", () => {
    const session = {
      ...sampleSession(),
      entries: [
        {
          id: "e1",
          expression: "1+1",
          result: "2",
          note: "line one\nline two",
          at: T0,
        },
      ],
    };
    const parsed = parseSessionMarkdown(sessionToMarkdown(session));
    expect(parsed?.entries[0].note).toBe("line one\nline two");
  });

  it("skips files that are not calculation documents", () => {
    expect(parseSessionMarkdown("# Just a note\n")).toBeNull();
    expect(
      parseSessionMarkdown("---\ntype: note\nid: x\n---\n\nbody\n"),
    ).toBeNull();
    expect(parseSessionMarkdown("---\ntype: calculation\n---\n\n")).toBeNull();
  });

  it("regenerates entry ids deterministically", () => {
    const parsed = parseSessionMarkdown(sessionToMarkdown(sampleSession()));
    expect(parsed?.entries.map((e) => e.id)).toEqual([
      "0198c9c9-aaaa-bbbb-cccc-00000a1b2c3d-0",
      "0198c9c9-aaaa-bbbb-cccc-00000a1b2c3d-1",
    ]);
  });
});

describe("filenames", () => {
  it("slugs the title and suffixes the id", () => {
    expect(sessionFileStem(sampleSession())).toBe("groceries-budget-1b2c3d");
    expect(sessionFileStem({ ...sampleSession(), title: "" })).toBe(
      "session-1b2c3d",
    );
  });

  it("places files under the folder directory", () => {
    const folders: Folder[] = [{ id: "f-shopping", name: "Shopping" }];
    expect(sessionFilePath(sampleSession(), folders)).toBe(
      "calculations/shopping/groceries-budget-1b2c3d.md",
    );
    expect(
      sessionFilePath({ ...sampleSession(), folderId: undefined }, folders),
    ).toBe("calculations/groceries-budget-1b2c3d.md");
  });

  it("slugify collapses punctuation and caps length", () => {
    expect(slugify("Hello, World!")).toBe("hello-world");
    expect(slugify("ÅÄÖ")).toBe("");
    expect(slugify("x".repeat(100))).toHaveLength(48);
  });
});

describe("folders registry", () => {
  it("round-trips and rejects malformed blobs", () => {
    const folders: Folder[] = [
      { id: "f-1", name: "Work" },
      { id: "f-2", name: "Home" },
    ];
    expect(parseFolders(serializeFolders(folders))).toEqual(folders);
    expect(parseFolders("not json")).toEqual([]);
    expect(parseFolders('{"folders": [{"id": 1}]}')).toEqual([]);
  });
});
