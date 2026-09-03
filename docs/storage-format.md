# Storage format

One markdown file per session, YAML front matter for metadata, the tape as
a readable bullet list. The format follows the sibling checklist app's
pattern: flat `key: value` front matter, ISO-8601 timestamps, a `type:`
discriminator, human-meaningful filenames, and a body that renders sensibly
in any markdown viewer. `src/app/codec.ts` is the implementation;
`tests/codec_test.ts` pins the byte-exact round trip.

## Directory layout

```
<storage root>/
  calculations/                      default namespace
    folders.json                     folder registry (names + empty folders)
    session-3f9a1c.md                loose session
    shopping/                        folder dir = slug(folder name)
      groceries-budget-1b2c3d.md
  <namespace-slug>/                  non-default namespaces
    calculations/
      …
```

- Filename: `<slug(title)>-<last 6 alnum of id>.md`; an unnamed session
  falls back to `session-<id6>`. Renaming a session changes the stem — the
  store writes the new path and removes the old file.
- The `folder:` front matter id is authoritative; the directory is a
  write-side projection so the tree stays browsable.
- `folders.json`: `{ "version": 1, "folders": [{ "id", "name" }] }`.

## Session file

```markdown
---
type: calculation
id: 0198c9c9-aaaa-bbbb-cccc-00000a1b2c3d
created: 2026-08-24T09:00:00.000Z
updated: 2026-08-24T09:05:00.000Z
mode: scientific
folder: f-shopping
---

# Groceries budget

- `12 × 4.5` = `54` _(at 2026-08-24T09:01:00.000Z)_
  Twelve packs at 4.50 each
- `54 + 12.9` = `66.9` _(at 2026-08-24T09:02:00.000Z)_
```

### Front matter

| Key        | Type           | Written when                                                                                      |
| ---------- | -------------- | ------------------------------------------------------------------------------------------------- |
| `type`     | `calculation`  | always — files without it are skipped                                                             |
| `id`       | uuid string    | always — files without it are skipped                                                             |
| `created`  | ISO-8601       | always                                                                                            |
| `updated`  | ISO-8601       | always                                                                                            |
| `mode`     | mode id string | only when not `basic` (custom-mode ids survive; an unknown id falls back to basic at the UI edge) |
| `folder`   | folder id      | only when grouped                                                                                 |
| `archived` | `true`         | only when archived                                                                                |

### Body

- Optional `# <title>` heading — the display title. An unnamed session has
  no heading (the stored title stays empty; the UI shows "Untitled
  session").
- One bullet per tape entry:
  ``- <markers> `<expression>` = `<result>` _(at <ISO-8601>)_`` — the
  expression and result in backticks so they read as code, the timestamp as
  a human-readable italic marker (the checklist sibling's marker style;
  legacy `*(at …)*` markers still parse).
- `<markers>` is zero, one, or both of these leading glyphs, in this order,
  each followed by a space:

  | Marker | Meaning                                                                                                                                 |
  | ------ | --------------------------------------------------------------------------------------------------------------------------------------- |
  | `⭐`   | Starred — the user highlighted this row from the tape's left gutter                                                                     |
  | `↳`    | Chained — the expression starts with the previous entry's result (folded back into one expression by the framework's `chainExpression`) |

  An entry with neither marker is written exactly as it was before the
  markers existed, so files predating them round-trip untouched. A `↳` on
  the first entry is dropped on parse — nothing precedes it.

- Note lines follow their entry, indented two spaces; multi-line notes keep
  their line breaks.

### Invariants

- **Round trip is byte-identical**: parse → serialize reproduces the exact
  file. Anything that would break this is a format change — update codec,
  tests, this document, and `examples/` together.
- **Entry ids are not stored** — they regenerate deterministically on parse
  (`<sessionId>-<index>`), which is what keeps the round trip stable.
- **Expressions are portable** — every mode feeds one evaluator grammar, so
  a file logged in programmer mode re-evaluates in basic mode and vice
  versa.
- Unknown lines end the entry being parsed rather than being swallowed into
  a note, so foreign additions degrade gracefully.
- **Chains are re-derivable, not stored** — the `↳` marker only records that
  an entry continued from the one above; the folded expression the tape's
  "Copy chain" action produces is rebuilt from the run at read time.
