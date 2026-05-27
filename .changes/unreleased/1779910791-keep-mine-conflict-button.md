---
type: Fixed
---

Sync conflict resolution: the "Keep mine" button in the cloud sync
conflict modal now actually pushes the local copy. The conflict
status itself was blocking the very save it was meant to trigger,
so clicks logged "save skipped — status=conflict" and the modal
stayed stuck open with no other way out than "Keep the other".
