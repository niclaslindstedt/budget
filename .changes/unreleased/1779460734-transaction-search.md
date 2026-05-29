---
type: Added
---

A new magnifier button on the bottom bar opens a transaction-search
modal that looks across every sheet at once. Type any part of a
description, the raw bank-statement text, company name, type name,
or category — or a number — and matching rows appear newest-first by
default, with the matched substring highlighted, so the most recent
entry surfaces straight away. Bank-text hits surface the original
bank memo on a third line so you can see why a row matched even
when its visible description is a user override or a company tag.
Number queries also match rows whose amount lands within ±20% of the
value, so "100" finds a 95 rent payment alongside the exact-100 ones.
Clicking a result switches to that row's sheet, scrolls it into view
(expanding older months if needed), and pulses the row briefly so you
can see where you landed. The last query is remembered while the tab
stays open. A count above the list shows how many entries matched and,
when more match than fit on screen, how many are shown ("267 hits,
showing 50").
A sort menu to the right of the search bar overrides the default
ordering: pick "Relevance" for the score-ranked list, "Date · Oldest
first", or "Amount · Highest first / Lowest first" to flip the result
list. The choice sticks while the tab stays open.
A select button turns the results into a multi-pick list: tick several
entries and edit, move, copy, or delete them all at once with the same
toolbar the sheet uses. Selection stays within a single sheet at a time
and covers only entries you added (imported bank lines and transfers
aren't selectable). A "Select all" action grabs every match on the
active sheet in one tap — including matches past the 50 shown — so a
search that turns up hundreds of rows can be acted on without ticking
each one.
