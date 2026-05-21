---
type: Fixed
---

The trash icon on a swiped budget row's action area is no longer
clipped off the right edge. The action cell was 160px wide but had to
fit six 32px-min-content buttons (192px total), so the rightmost
button got pushed past the row's `overflow: hidden` boundary and went
invisible. Widened the action cell to 192px so every action stays
reachable.
