---
type: Changed
---

The Accounts sheet's two tables (Accounts and Transfers) now follow
the budget sheet's visual conventions end to end — same bold uppercase
column headers, same icon size, same cell density, and the same
slightly tighter text scale on desktop. Each header carries an icon
that stays visible on mobile while the label drops away, with the
tag glyph sitting over the leftmost column so it lines up with the
coloured account glyphs below. The category tag under a transfer's
description, and the from/to chips in the transfers column on
desktop, now render as the same rounded pill the budget sheet uses
for entry types — coloured border, coloured background, glyph +
label — so a transfer reads with the same vocabulary as a budget
row. The transfers column stays a real column on mobile too,
sitting between the description and amount with just the coloured
account glyphs + arrow (no account names, so the column stays
tight); desktop still shows the full pilled chips with account
names. The transfer header's `↔` glyph sits above its own column
both on mobile and desktop.
