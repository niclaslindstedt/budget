---
type: Added
title: Find duplicates
---

The Accounts sheet's ⋯ menu now has **Find duplicates**, which scans every account's bank history for the same transaction — same date, description, amount, and running balance — imported into more than one account, pre-selects the account it belongs to (following the full running-balance chain, transfers included, so the genuine owner is picked), and lets you accept all the suggestions in one click to remove the stray copies; tap any match to see the surrounding bank history, where each matched balance shows a green checkmark when it sits cleanly on that account's running total or a red warning when it doesn't. When a whole statement landed in the wrong account, tick **remove the rest of that import** to drop the entire mis-imported batch at once, or **Ignore** a legitimate recurring charge so it's never flagged again. Duplicates are also caught **as you import**: if rows in the file you're importing already exist in another account, a picker opens automatically so you choose which account truly owns them and every copy is consolidated there, before the duplicates pile up.
