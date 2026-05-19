---
type: Added
---

Two-track deploy: the released app lives at `/`, the current `main` is
previewed at `/preview/`. Visiting the preview never reads or writes
your production data — local storage, the cloud-sync file, and the
folder-handle database all carry a `preview` namespace.
