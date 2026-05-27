---
type: Fixed
---

Clearing a budget row's description (via the inline × button, the
mobile popover, or the edit modal) now actually persists. Previously
the cleared description survived in memory but the underlying row
was treated as a transient placeholder and stripped before save —
which then tripped the shrink-warning safeguard and left the
previous text pinned in storage, so the description "came back" on
the next reload. Rows with any user-meaningful field (a
description, an amount, a tagged type, or a tagged company) now
keep their slot in storage, and clearing one field no longer makes
the whole row vanish.
