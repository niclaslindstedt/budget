---
type: Changed
---

Faster editing on workspaces with hundreds of imported history entries.
Each budget-cell keystroke previously re-resolved every history row's
labels (description normalisation + pattern matching) and rebuilt the
transaction-search index across every sheet, even when the search
modal was closed; the synthesis now caches between cell edits and the
search index builds lazily when the user opens search.
