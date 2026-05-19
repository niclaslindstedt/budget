---
type: Added
---

The complex create-entry modal can now compute a row's amount with a
formula instead of a fixed number. Toggle `fx` next to the amount
field to enter expressions like `endOfMonthBalance - 5000` (leave
5,000 in the account at month's end) or
`5000 - sheet("Wife").endOfMonthBalance` (top up the spouse's
sheet to 5,000). Variables cover `endOfMonthBalance`, `balanceBefore`,
`openingBalance`, `income`, `expenses`, `net`, `uncategorized`,
`prevMonth.*`, plus `categoryTotal()`, `typeTotal()`, `sheet()` for
cross-sheet references, and `min/max/clamp/abs/round`. Cross-sheet
references store the target's stable id, so renaming a sheet doesn't
break the formula. Re-editing a formula in v1 means deleting the row
and re-adding it through the complex modal.
