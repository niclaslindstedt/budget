---
type: Added
---

In the installed PWA, swipe left or right anywhere on a "neutral"
page area to switch to the next / previous sheet, with wrap-around
at both ends — matches the iOS Photos / Safari tab convention. The
new sheet slides in from the side you swiped from so the gesture
has the same horizontal-page feel as the OS. Existing gestures keep
ownership of their surface: swiping a budget row still reveals its
delete / edit / copy actions, and the sheet tablist at the bottom
still scrolls horizontally on its own. Inputs, open modals, and
iOS's edge-back band are excluded so the new gesture never fights
text selection or the OS. Disabled in a regular browser tab to
avoid colliding with the browser's own back / forward swipe.
