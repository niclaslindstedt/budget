---
type: Fixed
---

Stop the description popover (and every other floating panel) from
yanking the page away from the row you just edited when it closes.
On iOS the soft keyboard's hide animation already shifts the layout
viewport, and the panel's focus-restoration was chasing that with a
default `scrollIntoView`, scrolling the visible area off the row.
The focus call now sets `preventScroll: true` so the page stays put.
