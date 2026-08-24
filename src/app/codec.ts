// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The on-disk document format: one markdown file per session, YAML front
// matter for metadata, the tape as a readable bullet list. The pattern
// follows the sibling checklist app's codec — flat `key: value` front
// matter, ISO-8601 timestamps, a `type:` discriminator, human-meaningful
// filenames (`<slug>-<id6>.md`), and a body that reads correctly in any
// markdown viewer. See docs/storage-format.md for the full contract.
//
// Example file (calculations/groceries-budget-1a2b3c.md):
//
//   ---
//   type: calculation
//   id: 0198c9c9-…-1a2b3c
//   created: 2026-08-24T09:00:00.000Z
//   updated: 2026-08-24T09:05:00.000Z
//   folder: f-shopping
//   ---
//
//   # Groceries budget
//
//   - `12 * 4.5` = `54` _(at 2026-08-24T09:01:00.000Z)_
//     Twelve packs at 4.50 each
//   - `54 + 12.9` = `66.9` _(at 2026-08-24T09:02:00.000Z)_
//
// Entry ids are NOT stored — they are regenerated deterministically on parse
// (`<sessionId>-<index>`) so a load-then-save round trip is byte-identical.

import { DEFAULT_MODE } from "./modes.ts";
import type { Entry, Folder, Session } from "./session.ts";

export const CALCULATIONS_DIR = "calculations";
export const FOLDERS_FILE_NAME = "folders.json";

// ---------------------------------------------------------------------------
// Front matter
// ---------------------------------------------------------------------------

function renderFrontmatter(fields: Record<string, string>): string {
  const lines = Object.entries(fields).map(([k, v]) => `${k}: ${v}`);
  return `---\n${lines.join("\n")}\n---\n`;
}

function parseFrontmatter(text: string): {
  fields: Record<string, string>;
  body: string;
} {
  if (!text.startsWith("---\n")) return { fields: {}, body: text };
  const end = text.indexOf("\n---", 4);
  if (end === -1) return { fields: {}, body: text };
  const fields: Record<string, string> = {};
  for (const line of text.slice(4, end).split("\n")) {
    const sep = line.indexOf(":");
    if (sep === -1) continue;
    fields[line.slice(0, sep).trim()] = line.slice(sep + 1).trim();
  }
  const body = text.slice(end + 4).replace(/^\n+/, "");
  return { fields, body };
}

// ---------------------------------------------------------------------------
// Serialize
// ---------------------------------------------------------------------------

function renderEntry(entry: Entry): string[] {
  const at = new Date(entry.at).toISOString();
  const lines = [
    `- \`${entry.expression}\` = \`${entry.result}\` _(at ${at})_`,
  ];
  if (entry.note) {
    for (const noteLine of entry.note.split("\n")) {
      lines.push(`  ${noteLine}`);
    }
  }
  return lines;
}

export function sessionToMarkdown(session: Session): string {
  const front: Record<string, string> = {
    type: "calculation",
    id: session.id,
    created: new Date(session.createdAt).toISOString(),
    updated: new Date(session.updatedAt).toISOString(),
  };
  if (session.mode !== DEFAULT_MODE) front.mode = session.mode;
  if (session.folderId) front.folder = session.folderId;
  if (session.archived) front.archived = "true";

  const title = session.title.trim();
  const body: string[] = [];
  if (title) body.push(`# ${title}`, "");
  for (const entry of session.entries) body.push(...renderEntry(entry));
  return `${renderFrontmatter(front)}\n${body.join("\n")}${body.length ? "\n" : ""}`;
}

// ---------------------------------------------------------------------------
// Parse
// ---------------------------------------------------------------------------

// The timestamp marker is written `_(at …)_` (Prettier's emphasis style,
// so committed example files survive `make fmt`); `*(at …)*` is accepted
// on parse for compatibility.
const ENTRY_RE =
  /^- `(.+?)` = `(.+?)`(?: (?:\*\(at ([^)]+)\)\*|_\(at ([^)]+)\)_))?\s*$/;

// Parse a session file. Returns null when the file is not a calculation
// document (wrong/missing `type:` or `id:`) so callers can skip foreign
// files living in the same folder.
export function parseSessionMarkdown(text: string): Session | null {
  const { fields, body } = parseFrontmatter(text);
  if (fields.type !== "calculation" || !fields.id) return null;

  const created = Date.parse(fields.created ?? "");
  const updated = Date.parse(fields.updated ?? "");
  const session: Session = {
    id: fields.id,
    title: "",
    createdAt: Number.isNaN(created) ? 0 : created,
    updatedAt: Number.isNaN(updated)
      ? Number.isNaN(created)
        ? 0
        : created
      : updated,
    // Any non-empty string is kept — a custom mode id resolves (or falls
    // back to basic) at the UI edge, so the file survives a deleted mode.
    mode: fields.mode || DEFAULT_MODE,
    entries: [],
  };
  if (fields.folder) session.folderId = fields.folder;
  if (fields.archived === "true") session.archived = true;

  let current: Entry | null = null;
  const noteLines: string[] = [];
  const flush = () => {
    if (!current) return;
    const note = noteLines.join("\n").trim();
    if (note) current.note = note;
    session.entries.push(current);
    current = null;
    noteLines.length = 0;
  };

  for (const line of body.split("\n")) {
    const heading = /^# (.+)$/.exec(line);
    if (heading && !current && session.entries.length === 0) {
      session.title = heading[1].trim();
      continue;
    }
    const m = ENTRY_RE.exec(line);
    if (m) {
      flush();
      const at = Date.parse(m[3] ?? m[4] ?? "");
      current = {
        // Deterministic id so parse → serialize is byte-idempotent.
        id: `${session.id}-${session.entries.length}`,
        expression: m[1],
        result: m[2],
        at: Number.isNaN(at) ? session.createdAt : at,
      };
      continue;
    }
    if (current && line.startsWith("  ")) {
      noteLines.push(line.slice(2));
      continue;
    }
    if (line.trim() === "") continue;
    // Unknown line — end any open entry rather than swallowing it as a note.
    flush();
  }
  flush();
  return session;
}

// ---------------------------------------------------------------------------
// Filenames and directory layout
// ---------------------------------------------------------------------------

export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
    .replace(/-+$/, "");
}

function idSuffix(id: string): string {
  const alnum = id.replace(/[^a-zA-Z0-9]/g, "");
  return alnum.slice(-6).toLowerCase() || "000000";
}

// `<slug(title)>-<last 6 of id>.md`, so the file is both human-browsable and
// collision-proof; an unnamed session falls back to `session-<id6>.md`.
export function sessionFileStem(session: Session): string {
  const slug = slugify(session.title) || "session";
  return `${slug}-${idSuffix(session.id)}`;
}

export function folderDirSegment(folder: Folder): string {
  return slugify(folder.name) || folder.id;
}

// Path of a session file relative to the namespace root. The `folder:` front
// matter id stays authoritative; the physical directory is a write-side
// projection for browsability (same rule as the notes/checklist siblings).
export function sessionFilePath(
  session: Session,
  folders: readonly Folder[],
): string {
  const parts = [CALCULATIONS_DIR];
  const folder = folders.find((f) => f.id === session.folderId);
  if (folder) parts.push(folderDirSegment(folder));
  parts.push(`${sessionFileStem(session)}.md`);
  return parts.join("/");
}

// folders.json — the registry that names folders (and keeps empty ones
// alive). `{ "version": 1, "folders": [{ "id": …, "name": … }] }`.
export function serializeFolders(folders: readonly Folder[]): string {
  return JSON.stringify({ version: 1, folders }, null, 2) + "\n";
}

export function parseFolders(text: string): Folder[] {
  try {
    const doc = JSON.parse(text) as { folders?: unknown };
    if (!Array.isArray(doc.folders)) return [];
    return doc.folders.filter(
      (f): f is Folder =>
        typeof f === "object" &&
        f !== null &&
        typeof (f as Folder).id === "string" &&
        typeof (f as Folder).name === "string",
    );
  } catch {
    return [];
  }
}
