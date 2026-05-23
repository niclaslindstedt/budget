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
adds a small layout override: the wrapper and page-level floor
use `min-height: calc(100dvh + env(safe-area-inset-bottom))`,
because iOS 26 PWAs resolve `100dvh` to roughly the visible
viewport minus the home-indicator strip — adding the inset back
in puts the wrapper's bottom edge at the actual visible bottom,
so the default `sticky bottom-0` BottomBar lands at the screen
edge on the very first paint. On non-iOS-26 / no-home-indicator
devices the inset is `0` and the rule reduces to `100dvh`.
