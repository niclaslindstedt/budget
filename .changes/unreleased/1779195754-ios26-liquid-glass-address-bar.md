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
gets its own layout override that works around iOS 26's
overscroll-bounce: `min-height: 100dvh` on the wrapper plus the
page-level scroll surfaces, and `overscroll-behavior-y: none` to
cancel the rubber-band entirely. Without the bounce, the
BottomBar's default `position: sticky; bottom: 0` stays at the
visible viewport bottom forever — including on an empty
(non-scrolling) page where the user previously had no way to
drag the bar back into view after a bounce had shifted it.
