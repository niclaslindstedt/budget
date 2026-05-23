---
type: Changed
---

Mobile sheet rows now give the type column the same narrow 40 px track
as the completed column — both carry a single glyph on phone widths,
so the previous 56 px allotment wasted ~16 px the description column
can use instead. The amount and balance tracks also widen back to their
pre-v0.1 buffer so short currency tokens like `$` no longer sit flush
against the right edge the way longer ones like ` kr` did not.
