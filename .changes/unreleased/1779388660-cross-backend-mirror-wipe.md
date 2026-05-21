---
type: Fixed
---

Switching between cloud backends (Dropbox ↔ Google Drive, Local → Cloud, or
reconnecting after a session expired) no longer risks blanking the destination.
The offline cache is now tagged with the backend that wrote it and is dropped
when wrapped against a different provider, the cache is cleared before a
freshly linked cloud commits, and `Save now` is gated on a successful load so a
failed reconnect can never push the empty in-memory starter state over your
real data. The dirty-state sync icon also keeps a cloud glyph (with an upload
arrow) instead of switching to a floppy disk, so it stays obvious which backend
the session is bound to.
