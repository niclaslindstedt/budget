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
chrome's footprint on an empty budget. In an installed PWA the
BottomBar uses `position: fixed; inset: auto 0 0 0` (matching the
Modal's fullscreen-footer pattern) so it anchors to the screen
bottom, with the bar's `env(safe-area-inset-bottom)` padding
lifting the icons above the home indicator and a matching
`<main>` `padding-bottom` keeping the last AddRow clear of the
out-of-flow bar.
