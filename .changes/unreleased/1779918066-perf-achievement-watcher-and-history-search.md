---
type: Changed
---

Sped up the per-keystroke render path. The achievement watcher now skips
predicates whose state slice didn't change on a given dispatch, and the
account history modal's search bar no longer re-runs `Intl.NumberFormat`
on every entry per keystroke — both gave noticeable lag on workspaces
with thousands of rows or history entries.
