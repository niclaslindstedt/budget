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
gets its own layout path that works around iOS 26's
viewport-coherence regression (WebKit #297779 / #301994): the
compositor pins fixed elements to a stale rectangle 100–200 px
taller than the actually-rendered viewport, and `bottom: 0` /
`100dvh` / `innerHeight` / `env(safe-area-inset-bottom)` all read
from the same poisoned numbers on a cold launch — which is why
the bar visibly floated above the screen edge and only "snapped
to place" when the user dragged the page. The fix has three
coordinated parts: `main.tsx` calls a one-shot
`bootViewportWorkaround()` BEFORE React mounts that toggles the
`<meta name="viewport">` `viewport-fit` token from `cover` to
`auto` and back across two animation frames, then does a no-op
`scrollBy(0, 1)` / `scrollBy(0, -1)` round-trip — that combination
is the documented community-shipped way to force iOS to reconcile
the compositor without a real user scroll. A `useVisualViewportOffset`
hook then keeps `--vv-bottom` (= `visualViewport.height +
visualViewport.offsetTop`, the only honest signal iOS 26 PWAs
expose) in sync with viewport / orientation / pageshow events.
And the CSS drives the bar's position with `transform:
translateY(calc(var(--vv-bottom) - 100%))` instead of `bottom: 0`,
so the bar's bottom edge lands at the real visible viewport floor
regardless of how the compositor's stale rectangle reports. The
same block reserves bottom padding on `<main>` so the AddRow
button stays clear of the now-out-of-flow bar and floors
`env(safe-area-inset-bottom)` so the icons keep a visible gap
from the home indicator even when iOS reports the inset as `0px`
after a cold reopen.
