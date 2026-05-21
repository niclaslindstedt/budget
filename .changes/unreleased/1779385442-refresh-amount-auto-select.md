---
type: Fixed
---

Refreshing the page on iOS no longer reopens the amount cell of the
last-edited row with its value pre-selected. Safari restores focus
to the previously focused input on reload, which used to trip the
"select all on focus" behaviour and pop the keyboard before the user
had touched the page. Numeric inputs now select on focus only after
a real tap or keypress, so genuine taps still get the fast-retype
behaviour while browser-restored focus is left alone.
