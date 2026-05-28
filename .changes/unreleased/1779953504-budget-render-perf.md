---
type: Changed
---

Budget rendering is noticeably snappier on large workspaces. Three hot
paths got tighter algorithms: history-row synthesis now caches the
match-rule lookup per (description, amount, transfer) so a recurring
merchant pays one rule walk instead of one per occurrence; the running
balance and per-month display now share a single sort of the rows
array instead of each sorting independently on every keystroke; and
the read-only viewer modal's search filter now reuses a pre-formatted
index so each typed character runs cheap `indexOf` checks against
cached strings instead of re-lowercasing and re-formatting every row.
