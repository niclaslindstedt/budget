---
type: Changed
---

Faster formula resolution on sheets that reference each other, and
faster post-import rename application on accounts with thousands of
history entries. Formulas that share a `sheet("…")` target now reuse a
cached aggregate instead of re-walking the referenced sheet's rows on
every call, and the import-rename reducer indexes history by id once
instead of scanning it per accepted suggestion.
