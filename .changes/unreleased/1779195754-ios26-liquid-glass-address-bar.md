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
gets its own layout path: fixed-position chrome anchored straight
to the visual viewport, a reserve band on `<main>` so the AddRow
button stays clear of the bar, a floor on `env(safe-area-inset-bottom)`
so the bar keeps a visible gap from the home indicator even when
iOS 26 reports the inset as `0px` after a cold reopen, and a
JavaScript-measured `--viewport-bottom-offset` that translates the
fixed bar down by the difference between `window.innerHeight` and
`visualViewport.height`. Together these work around iOS 26's
`visualViewport` regression that was pinning the bar 100–200 px
above the screen edge on a first-launch empty install (and "snapping
shut" the moment the user dragged).
