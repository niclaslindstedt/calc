---
type: Fixed
---

**The keypad's bottom row no longer falls off the screen** — The installed iOS PWA (and iOS Safari) cut the layout off above the `=` key: the reveal handle's chevron had no size and stretched to fill half the screen, and the app shell sized itself to a viewport iOS letterboxes. The shell now sizes to `--app-height` (lifted to `100vh` in the installed iOS PWA, matching the sibling apps), every framework glyph is sized, and the keypad keeps a floor tall enough for all its rows — the display gives up the space instead.
