---
type: Fixed
---

Cloud sync no longer surfaces a phantom "Sync conflict" warning when
this device is the only one editing. Rapid Save clicks during a slow
upload to Dropbox or Google Drive could leave two saves racing for
the same file revision — one would land, the other would be rejected
as out-of-date — and the conflict surfaced even though both copies
held the same data. Saves now run one at a time, and a fresh edit
during a slow upload queues a single trailing save instead of
piling up.
