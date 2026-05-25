---
type: Added
---

New eye-icon **view-mode** button on every sheet, between the existing
pencil (edit) and download buttons next to the sheet title. Tap it to
open a read-only viewer that shows the sheet's months and rows without
any of the editing chrome — no inline cell editors, no add-row plus,
no column-drag handles, no select-mode checkboxes — just the
data, clean and compact. The viewer fills the screen on mobile and
opens as a wide centered card on desktop, and renders every month of
history up-front so the in-modal search filter sees the full ledger
rather than just the recently-loaded months. Months dated after today
are tucked behind a clickable **Show 3 future months** line above the
current fiscal month so the modal opens anchored on today instead of
deep in next year's planning. Each click reveals another three months
and keeps the current-month header parked in view, matching the
paginated reveal the editable sheet already uses, and the line stays
out of the way while a search is active so a query reveals every
match. Days inside each
month run newest-first to match the descending month order, so the
most recent activity sits at the top of every section. The done column is
shown inline as a small check next to the date and uncompleted rows
fade slightly, so the table reads as one tight stack instead of
spending a whole column on a checkmark.
