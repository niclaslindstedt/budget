---
type: Fixed
---

Tapping outside a modal (the date picker on a row, confirmation
dialogs, etc.) now only dismisses the modal instead of also
interacting with whatever sheet element happened to sit behind the
backdrop. Selecting text inside a modal and releasing the mouse
over the backdrop no longer dismisses the modal either — only a
press that starts on the backdrop closes it.
