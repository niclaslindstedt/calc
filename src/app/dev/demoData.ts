// SPDX-License-Identifier: PolyForm-Noncommercial-1.0.0
//
// The demo shelf: eight saved sessions in three folders, the kind of
// calculations somebody keeps a tape of because they will have to explain the
// number later — a floor to order, an invoice to send, a trip to split, a roof
// to cut, a subnet to carve. It is what `VITE_SEED=demo` boots into (see
// `demo.ts`), which makes it both the live demo and what the store
// screenshots photograph, so it is written to be READ: every tape is short
// enough to take in at a glance, every note says why the number is what it
// is, and the stars sit on the answers.
//
// Two properties are load-bearing:
//
//   - NO RESULT IS TYPED BY HAND. A step names its expression and the result
//     comes from the framework evaluator the keypad itself uses, formatted
//     the way `=` formats it — so a screenshot can never show arithmetic the
//     app would not have done. A chained step names only what was typed after
//     `=` (`×1.1`), and is prefixed with the result above it exactly as the
//     display seeds it.
//
//   - IT NEVER AGES. Every timestamp is an offset from the `now` it is built
//     for, so the shelf always reads as this month's work, and two builds on
//     the same day are the same document.
//
// Expressions are spelled the way the keypad writes them — `×`, `÷`, `−`, no
// spaces — so a demo file is byte-for-byte a file the app could have saved.

import {
  closeParens,
  evaluate,
  formatResult,
} from "@niclaslindstedt/oss-framework/expression";

import type { ModeId } from "../modes.ts";
import type { Entry, Folder, Session } from "../session.ts";

/** One `=` on the tape. `then` is a chained step: what was typed after the
 *  previous `=`, which the display had seeded with its result. */
type Step = ({ expr: string } | { then: string }) & {
  note?: string;
  star?: boolean;
};

type Tape = {
  title: string;
  folder?: string;
  mode?: ModeId;
  /** Whole days before `now`, and the local time the first `=` was pressed. */
  daysAgo: number;
  at: [hours: number, minutes: number];
  steps: Step[];
};

export const DEMO_FOLDERS: Folder[] = [
  { id: "f-demo-home", name: "Home" },
  { id: "f-demo-work", name: "Work" },
  { id: "f-demo-travel", name: "Travel" },
];

const folderId = (name: string) =>
  DEMO_FOLDERS.find((f) => f.name === name)?.id;

// Newest first, which is also the order the sidebar lists them in. The first
// is the one a start with no working tape opens (`sessionToResume`), so it is
// the session the demo — and the first screenshot — lands on.
const TAPES: Tape[] = [
  {
    title: "Kitchen floor",
    folder: "Home",
    daysAgo: 0,
    at: [9, 12],
    steps: [
      { expr: "14.5×11", note: "Kitchen floor, sq ft" },
      { then: "−6×3.5", note: "Minus the island" },
      { then: "×1.1", note: "Plus 10% for cuts and waste" },
      { then: "÷20", note: "Boxes of 20 sq ft — round up to 8" },
      { expr: "8×64.99", note: "White oak, 8 boxes", star: true },
      { expr: "2×38.5+4×12.75", note: "Underlay and trim" },
      {
        expr: "519.92+128+350",
        note: "All in, with the installer's quote",
        star: true,
      },
    ],
  },
  {
    title: "Invoice — September",
    folder: "Work",
    daysAgo: 2,
    at: [16, 40],
    steps: [
      { expr: "38.5×95", note: "Design, 38.5 h at 95/h" },
      { expr: "6×120", note: "Workshop day, 6 h at 120/h" },
      { expr: "3657.5+720+184.2", note: "Plus travel — receipts attached" },
      { then: "×0.3", note: "Set aside for tax", star: true },
      { expr: "4561.7−1368.51", note: "What's left to live on" },
    ],
  },
  {
    title: "Lisbon trip — split",
    folder: "Travel",
    daysAgo: 4,
    at: [21, 5],
    steps: [
      { expr: "1260+412.8+95.2", note: "Apartment, car and tolls" },
      { then: "÷4", note: "Each, four of us", star: true },
      { expr: "442−180", note: "Sam already paid 180 for groceries" },
    ],
  },
  {
    title: "Shed roof",
    folder: "Home",
    mode: "scientific",
    daysAgo: 7,
    at: [11, 30],
    steps: [
      { expr: "sqrt(8^2+3^2)", note: "Rafter: 8 ft run, 3 ft rise" },
      { expr: "atan(3÷8)×180÷π", note: "Pitch, in degrees" },
      { expr: "2×8.54×10", note: "Both sides of the roof, sq ft" },
      { then: "÷100", note: "Felt covers 100 sq ft a roll — buy 2" },
    ],
  },
  {
    title: "Office subnet",
    folder: "Work",
    mode: "programmer",
    daysAgo: 11,
    at: [14, 15],
    steps: [
      { expr: "1<<6", note: "Addresses in a /26" },
      { then: "−2", note: "Usable hosts", star: true },
      { expr: "0xFF&0b11000000", note: "Last octet of the mask" },
      { expr: "0xC0A80A40", note: "192.168.10.64 as a number" },
      { expr: "1500−20−20", note: "TCP payload on a 1500 MTU link" },
    ],
  },
  {
    title: "Sourdough ×3",
    folder: "Home",
    daysAgo: 16,
    at: [8, 45],
    steps: [
      { expr: "500×3", note: "Flour, grams" },
      { then: "×0.72", note: "Water at 72% hydration" },
      { expr: "1500×0.2", note: "Starter" },
      { expr: "1500×0.02", note: "Salt" },
    ],
  },
  {
    title: "Monthly budget",
    daysAgo: 23,
    at: [19, 20],
    steps: [
      {
        expr: "4850−1650−320−410−185",
        note: "After rent, car, groceries and bills",
      },
      { then: "×0.2", note: "Straight into savings", star: true },
      { expr: "2285−457", note: "Everything else" },
    ],
  },
  {
    title: "Pendulum lab",
    mode: "scientific",
    daysAgo: 29,
    at: [13, 50],
    steps: [
      { expr: "2π×sqrt(0.8÷9.81)", note: "Period for a 0.8 m string, s" },
      { expr: "10×1.7943", note: "Ten swings should take this long" },
      { expr: "4π^2×0.8÷1.81^2", note: "g from the period we measured" },
    ],
  },
];

/** A fixed, readable id per demo session: the file stem's last six
 *  characters come from it, so the paths stay stable across builds. */
function demoId(index: number): string {
  return `0000000d-e000-4000-8000-${String(index + 1).padStart(12, "0")}`;
}

function evaluateStep(expression: string): string {
  return formatResult(evaluate(closeParens(expression)));
}

function buildTape(tape: Tape, index: number, now: number): Session {
  const start = new Date(now);
  start.setDate(start.getDate() - tape.daysAgo);
  start.setHours(tape.at[0], tape.at[1], 0, 0);
  // A demo built early in the morning must not stamp today's tape after the
  // moment it is being read, so today's entries end a minute ago at the
  // latest.
  const first = Math.min(
    start.getTime(),
    now - tape.steps.length * 60_000 - 60_000,
  );

  const id = demoId(index);
  const entries: Entry[] = [];
  tape.steps.forEach((step, i) => {
    const previous = entries[entries.length - 1];
    const chained = "then" in step;
    if (chained && !previous) {
      throw new Error(`demo "${tape.title}": a chain needs a step before it`);
    }
    const expression = chained ? `${previous.result}${step.then}` : step.expr;
    const entry: Entry = {
      id: `${id}-${i}`,
      expression,
      result: evaluateStep(expression),
      // Roughly a minute and a half between presses of `=`.
      at: first + i * 90_000,
    };
    if (step.note) entry.note = step.note;
    if (step.star) entry.starred = true;
    if (chained) entry.chained = true;
    entries.push(entry);
  });

  const session: Session = {
    id,
    title: tape.title,
    createdAt: first,
    updatedAt: entries[entries.length - 1].at,
    mode: tape.mode ?? "basic",
    entries,
  };
  const folder = tape.folder ? folderId(tape.folder) : undefined;
  if (folder) session.folderId = folder;
  return session;
}

/** The demo shelf as it stands at `now`. Pure: the same `now` builds the same
 *  sessions. */
export function buildDemoSessions(now = Date.now()): Session[] {
  return TAPES.map((tape, index) => buildTape(tape, index, now));
}
