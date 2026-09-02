---
type: Changed
---

**A square root reads as `√` on the tape** — A calculation entered with the `√` key was logged as the `sqrt(9)` the evaluator parses, so the tape read back a word the keypad never showed. The display and the tape now set that name as an accented `√`, leaving the bracket and the argument where they are — `√(9)` — while the entry, and the markdown file it saves to, still store the expression verbatim.
