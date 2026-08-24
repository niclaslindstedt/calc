// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The session domain model. A session is one calculator tape: every
// calculation that ended with `=` appends an Entry, and an entry can carry a
// free-text note explaining it. Sessions are scratch (in memory only) until
// the user saves them with the disk icon; saved sessions live as markdown
// files in the chosen storage backend (see codec.ts for the file format).

import { DEFAULT_MODE, type ModeId } from "./modes.ts";

export type Entry = {
  id: string;
  expression: string;
  result: string;
  // Optional free-text comment attached via the left-swipe note action.
  note?: string;
  // Epoch ms when `=` was pressed.
  at: number;
};

export type Session = {
  id: string;
  // Empty until the user names it; the UI falls back to sessionTitle().
  title: string;
  createdAt: number;
  updatedAt: number;
  // The calculator mode (layout) last used with this session — opening the
  // session resumes it. Stored in front matter; absent means "basic".
  mode: ModeId;
  // Folder id from the sidebar tree; undefined = loose at the top level.
  folderId?: string;
  archived?: boolean;
  entries: Entry[];
};

export type Folder = {
  id: string;
  name: string;
};

export function newId(): string {
  return crypto.randomUUID();
}

export function newSession(
  now = Date.now(),
  mode: ModeId = DEFAULT_MODE,
): Session {
  return {
    id: newId(),
    title: "",
    createdAt: now,
    updatedAt: now,
    mode,
    entries: [],
  };
}

// Display fallback only — never stored (mirrors the notes app's convention
// of keeping the stored title empty until the user names it).
export function sessionTitle(session: Session): string {
  return session.title.trim() || "Untitled session";
}

const NUMBERED_TITLE_RE = /^Session(?: (\d+))?$/;

// Suggest "Session", "Session 2", "Session 3", … skipping titles already in
// use — the default offered by the save dialog so a quick save needs no
// typing but never collides.
export function nextSessionTitle(sessions: readonly Session[]): string {
  let max = 0;
  for (const s of sessions) {
    const m = NUMBERED_TITLE_RE.exec(s.title.trim());
    if (m) max = Math.max(max, m[1] ? Number.parseInt(m[1], 10) : 1);
  }
  return max === 0 ? "Session" : `Session ${max + 1}`;
}

export function appendEntry(
  session: Session,
  expression: string,
  result: string,
  now = Date.now(),
): Session {
  const entry: Entry = { id: newId(), expression, result, at: now };
  return {
    ...session,
    entries: [...session.entries, entry],
    updatedAt: now,
  };
}

export function setEntryNote(
  session: Session,
  entryId: string,
  note: string,
  now = Date.now(),
): Session {
  const trimmed = note.trim();
  return {
    ...session,
    entries: session.entries.map((e) =>
      e.id === entryId
        ? trimmed
          ? { ...e, note: trimmed }
          : { ...e, note: undefined }
        : e,
    ),
    updatedAt: now,
  };
}

export function removeEntry(
  session: Session,
  entryId: string,
  now = Date.now(),
): Session {
  return {
    ...session,
    entries: session.entries.filter((e) => e.id !== entryId),
    updatedAt: now,
  };
}

// A scratch session with no entries and no title carries nothing worth
// keeping — the UI discards it silently when switching away.
export function isDiscardable(session: Session): boolean {
  return session.entries.length === 0 && session.title.trim() === "";
}
