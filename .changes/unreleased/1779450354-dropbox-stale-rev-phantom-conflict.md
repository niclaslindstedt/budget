---
type: Fixed
---

Cloud sync no longer surfaces a phantom "Sync conflict" warning when
this device is the only one editing. Typing rapidly during a slow
upload to Dropbox or Google Drive could leave the app holding the
previous file revision even after the cloud had already accepted a
newer one; the next save sent that stale revision, the cloud rejected
it as out-of-date, and the conflict surfaced even though both copies
held the same data.
