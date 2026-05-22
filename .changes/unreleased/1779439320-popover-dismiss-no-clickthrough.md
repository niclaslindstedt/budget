---
type: Fixed
---

Tapping outside an open dropdown or popover (entry-type picker,
category picker, backend picker, the description popover on the
mobile sheet, …) now only closes it, regardless of where the tap
lands. Previously a tap on another cell in the same row — or on
another input inside the same modal — would close the dropdown AND
also focus the input / activate the cell beneath the tap, so
dismissing a stray picker felt like it pulled the rug out from under
you.
