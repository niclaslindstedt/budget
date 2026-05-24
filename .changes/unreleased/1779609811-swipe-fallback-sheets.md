---
type: Added
---

Swipe left or right anywhere on a "neutral" page area to switch to
the next / previous sheet, with wrap-around at both ends — matches
the iOS Photos / Safari tab convention. Existing gestures keep
ownership of their surface: swiping a budget row still reveals its
delete / edit / copy actions, and the sheet tablist at the bottom
still scrolls horizontally on its own. Inputs, open modals, and
iOS's edge-back band are excluded so the new gesture never fights
text selection or the OS.
