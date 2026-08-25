---
type: Changed
---

**Settings → Storage picks a backend instead of hiding them** — Device, Folder, Dropbox and Drive are now segments of one picker, each explaining what it stores and where. A backend this browser or build cannot reach (no File System Access API, no OAuth app key baked in) says so when picked, rather than vanishing and leaving the tab looking empty. Connect buttons spin while an OAuth redirect or the directory picker is in flight, a dismissed folder picker is a quiet no-op, and switching straight from one connected backend to another now rebuilds the session store instead of writing on through the old one.
