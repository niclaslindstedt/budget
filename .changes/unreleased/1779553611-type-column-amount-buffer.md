---
type: Changed
---

Mobile sheet rows now give the type column the same narrow 40 px track
as the completed column — both carry a single glyph on phone widths,
so the previous 56 px allotment wasted ~16 px the description column
can use instead. The amount column hugs its longest number tightly
when currency is hidden or rendered before it; when currency is
rendered after the number, the column widens to give short tokens
like `$` room to sit clear of the right edge instead of flush against
it the way longer ones like ` kr` did not.
