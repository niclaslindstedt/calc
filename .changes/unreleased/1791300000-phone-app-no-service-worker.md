---
type: Fixed
---

**The phone app carries no service worker** — Its bundled page is built as a shell build, like the desktop app's: no service worker and no "reload to apply" prompt, since the app changes only when a new version ships from the store. The bundle script now refuses a page that still holds one.
