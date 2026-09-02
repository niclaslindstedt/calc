---
type: Changed
---

**Naming a session is what saves it — the save button is gone** — The disk
icon has been removed from the top bar. Type a name for the tape and it
becomes a markdown file there and then, and every calculation after that is
written to storage as you press `=`, so a named session is never behind what
is on the tape. Notes, stars and deleted rows still debounce; the status
beside the mode buttons says where the tape stands (_Unsaved_, _Saving…_,
_Saved_, _Save failed_, or _This device_ when no backend is connected). An
unnamed tape stays scratch and keeps living on the device, and a session
named before a backend was connected is written out as soon as one is.
