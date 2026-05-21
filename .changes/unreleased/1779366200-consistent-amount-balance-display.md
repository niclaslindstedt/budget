---
type: Changed
---

Balance column now renders with the same `+ / − $ 1 200` layout as the
amount column — a sign glyph, then the currency symbol, then the
number — instead of folding the sign into the value. The glyph on
the balance is read-only; only the amount column toggles sign on
tap. Mobile widens both columns slightly so four-digit values with a
thousand separator no longer get clipped on the right edge.
