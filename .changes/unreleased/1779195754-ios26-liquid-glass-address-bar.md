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
takes a page from the Modal component's fullscreen-footer
playbook: the BottomBar is promoted to `position: fixed; inset:
auto 0 0 0` so it anchors to the actual screen bottom (the layout
viewport edge, which is correct in PWA mode even when every
viewport unit isn't), and `<main>` reserves a `padding-bottom` so
the AddRow at the foot of the last month clears the now
out-of-flow bar. The wrapper goes back to a clean
`min-height: 100dvh` so an empty budget doesn't become scrollable.
The bar's existing inner `padding-bottom: env(safe-area-inset-bottom)`
lifts the icons above the home-indicator strip.
