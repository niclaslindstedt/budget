---
type: Added
---

Bank-history imports now learn how you rename entries and suggest the
same renames next time. Every direct rename — from the pen-button
history-edit modal or the budget-view quick-rename on a history-backed
row — is remembered per account against the normalised bank
description, so a recurring merchant collapses across months even
though the date prefix changes each time. The last step of every
import opens a Review-suggested-renames dialog with one editable row
per learned mapping; toggle off the ones you want to keep as-is or
tweak the text inline before committing. The footer offers Cancel
(abort the import), Skip renames (import without renaming), and Apply
renames (import + stamp the accepted ones).
