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
gets its own minimal layout override that works around iOS 26's
viewport-coherence regression (WebKit #297779 / #301994): every
viewport-related signal — `100dvh` / `100svh` / `100lvh` /
`window.innerHeight` / `visualViewport.height` /
`env(safe-area-inset-bottom)` — reads from a stale compositor
rectangle 100–200 px taller than the actually-rendered viewport
on a cold launch, which is why the bar visibly floated above the
screen edge on a first install. Per the fozzedout iPhone PWA gist
(the community-shipped reference fix), `100vh` is the ONE
viewport-related signal iOS 26 standalone gets right from cold
start, so the standalone-mode CSS switches the wrapper and the
page-level floor from `100svh` / `100dvh` to `100vh`. The
BottomBar keeps its default `position: sticky; bottom: 0`, which
inside the now-correctly-sized parent lands at the screen edge on
the first paint AND stays there on an empty (non-scrolling) page
— important because new users without any rows can't drag to
"snap" the bar back if it walks off.
