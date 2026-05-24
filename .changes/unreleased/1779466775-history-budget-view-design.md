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
reads the same in both surfaces. The Transfers section on the same
page picks up the matching month-divider chrome, so day-only dates
like `18/5` stay readable once the year or month rolls over.

The budget-sheet viewer (Eye button) and the account-history modal also
gained a search bar at the top that filters rows in place against
description, type name, amount, and date. It sits in document flow and
scrolls away with the content, so the table claims the full viewport
once you're reading. On mobile the account-history modal's column
headers collapse to glyph-only (calendar / tag / lines / currency /
wallet) to match the budget view's sheet table; desktop keeps the
glyph + label pairing.
