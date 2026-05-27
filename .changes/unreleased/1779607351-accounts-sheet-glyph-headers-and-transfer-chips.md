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
description, and the from/to chips in the transfers column, now
render as the same rounded pill the budget sheet uses for entry
types — coloured border, coloured background, glyph + label — so a
transfer reads with the same vocabulary as a budget row. On mobile
the transfers table's date column stays narrower and sits tighter
against the description to free up room for the description text,
and each transfer row's `from → to` summary picks up the coloured
account glyphs from the accounts list alongside the account names,
so source and destination are recognisable at a glance. The
transfer header's `↔` glyph sits next to the description glyph on
mobile (no label, matching the other column headers) so the from/to
chips have a matching companion icon in the row above them.
