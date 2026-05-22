---
type: Changed
---

The Accounts page's account-history modal now matches the budget view's
design: a TYPE column with the same category icons the budget rows show,
month dividers tinted by the per-month pastel, and full-date cells in
place of the day-only mobile shorthand. The resolved description and
type are pulled through the same priority chain
(`userDescription`/`userTypeId` → match rule → merchant hint → raw bank
text) the budget view already uses, so a relabelled bank entry now
reads the same in both surfaces.

The budget-sheet viewer (Eye button) and the account-history modal also
gained a search bar at the top that filters rows in place against
description, type name, amount, and date. It sits in document flow and
scrolls away with the content, so the table claims the full viewport
once you're reading. The `BALANCE` column header is abbreviated to
`BAL` on mobile so it stops getting clipped on narrow phones.
