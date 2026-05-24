---
type: Changed
---

The mobile budget sheet now writes the actual description text into
the description column, truncated with `…` when it doesn't fit,
instead of collapsing every row down to a `…` placeholder (or the
entry type's name) and hiding the description behind a popover. Empty
rows still show `…` so the cell stays tappable, and recurring rows
keep the repeat glyph as a prefix; tapping the cell still opens the
same edit popover.
