---
type: Fixed
---

A history-row description that was cleared through the edit modal or
the inline popover would silently come back as soon as the merchant
hint or matching pattern fired again at synthesis time. The reducer
now stamps an empty-string "explicit clear" marker on the entry
instead of deleting the field, and `resolveEntryLabels` reads that
marker to skip the rule / hint description chain — so the cell
falls back cleanly to the company tag, type tag, or raw bank text
the next render. Older entries previously cleared the legacy way
(no marker) keep working as before; clear them once more and the new
behaviour takes over.
