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
auto 0 0 0` so it anchors to the actual screen bottom, and
`<main>` reserves a `padding-bottom` so the AddRow at the foot of
the last month clears the now out-of-flow bar. The wrapper stays
at a clean `min-height: 100dvh` so an empty budget doesn't become
scrollable. On iOS 26 PWAs `fixed; bottom: 0` actually anchors
~20–30 px above the actual screen edge on cold launch (WebKit
#297779 — a clipped `visualViewport.bottom`), so a JavaScript
hook (`useVisualViewportOffset`) writes the gap between
`window.innerHeight` and `visualViewport.height` to a
`--bar-offset` CSS variable, and the bar's `translate: 0
var(--bar-offset)` shifts it down by exactly that gap from the
first paint. Once iOS reconciles the viewport (which the first
overscroll-bounce used to trigger), the gap goes to 0 and the
translate collapses to a no-op — so the bar lands at the screen
edge immediately and stays there.
