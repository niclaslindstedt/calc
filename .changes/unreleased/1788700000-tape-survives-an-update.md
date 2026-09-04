---
type: Fixed
---

**An unsaved tape survives an app update.** Pressing restart on the update
prompt now waits for the working tape to reach this device before it reloads,
so a reload can no longer land on a write still in flight. And the app no
longer mistakes a device it could not read for a device with nothing on it:
that answer used to open a fresh tape and clear the record the old one was
still sitting in, which is how an unsaved tape could go missing for good.
When the tape cannot be read — a blocked database upgrade during the update's
reload, a private window, a denied quota — the record is left untouched, and
the read is retried against a freshly opened database first.
