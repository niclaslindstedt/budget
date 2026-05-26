---
type: Fixed
---

Editing a budget row on iOS no longer snaps the page to the top after
pressing Save. The body scroll lock now snapshots the scroll position
when a modal opens and restores it on close — iOS Safari (which
otherwise resets `scrollY` to 0 when `body.overflow` is hidden) lands
back exactly where the user opened the modal from, so the next item
in the list stays where they were looking.
