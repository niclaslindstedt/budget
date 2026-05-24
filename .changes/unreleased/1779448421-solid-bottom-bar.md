---
type: Changed
---

The sheet tabs at the foot of the page are now a single solid full-
width bar instead of a centered floating pill. Tabs scroll
horizontally on the left so a workspace with many sheets keeps every
one reachable (the active tab is auto-scrolled back into view when
you switch), and the bulk-edit action set takes the same left slot
when select-mode is on. The right edge of the bar houses the undo,
redo, action-history, and select-mode toggle so every editor control
is in one strip along the bottom edge. The bar collapses out of the
way when you scroll down through a long sheet and slides back in on
any upward scroll — in browser mode this rides the URL bar's natural
hide-on-scroll, and in the installed PWA the same behaviour is driven
from the page's scroll position so the row content gets the full
height when you're heads-down editing.
