---
type: Fixed
---

iOS 26 Safari's translucent Liquid Glass address bar now lets the
budget show through it when there's something to show — the page
sits at the chrome-excluded inner box (`svh`) by default and grows
past it once a sheet has enough rows to scroll, so tall budgets
tint the bar with the rows behind it while an empty sheet no longer
leaves a scrollable band of blank page background below the AddRow
button. The bottom action bar sticks to the visible-viewport floor
in flow rather than floating above it, so it lands at the same
on-screen position whether the sheet is empty or scrolls past the
screen edge — and the page can no longer be pulled up by the
chrome's footprint on an empty budget. The installed-PWA window
gets its own layout path: the bottom action bar is anchored via
`top: var(--screen-h-px)` with `translate: 0 -100%`, where
`--screen-h-px` is the JavaScript-measured `window.innerHeight`
written to `<html>` before React mounts and re-synced on every
viewport / orientation event. `innerHeight` is the one
viewport-related value iOS 26 still reports correctly, so anchoring
to it sidesteps the `visualViewport` regression that was pinning
the bar 100–200 px above the screen edge on a first-launch empty
install (and "snapping it to place" the moment the user dragged).
The same standalone-mode block reserves bottom padding on `<main>`
so the AddRow button stays clear of the now-out-of-flow bar and
floors `env(safe-area-inset-bottom)` so the icons keep a visible
gap from the home indicator even when iOS reports the inset as
`0px` after a cold reopen.
