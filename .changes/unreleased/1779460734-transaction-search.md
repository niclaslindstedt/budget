---
type: Added
---

A new magnifier button on the bottom bar opens a transaction-search
modal that looks across every sheet at once. Type any part of a
description, the raw bank-statement text, company name, type name,
or category, or a tag, or a number — and matching rows appear ranked
by relevance by default, with the matched substring highlighted.
Relevance favours clean whole-word matches over letters buried
mid-word — searching "Car" surfaces a row you tagged or described
"Car" ahead of one that merely starts "Carlo" or hides "car" inside
"Childcare" — then weighs where the match landed (your own
description first, then tag, company, type, and category), and
finally how recent the row is, so the newest of otherwise-equal
matches leads. All of that is adjustable in the new Settings → Search
tab: match-quality-vs-field priority, the per-field weights, how much
recency counts, the amount tolerance, and how many results show.
Bank-text hits surface the original
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
ordering: pick "Date · Newest first / Oldest first" or "Amount ·
Highest first / Lowest first" to flip the result list, or return to
"Relevance". The choice sticks while the tab stays open.
A select button turns the results into a multi-pick list: tick several
entries and edit, move, copy, or delete them all at once with the same
toolbar the sheet uses. Selection stays within a single sheet at a time
and covers only entries you added (imported bank lines and transfers
aren't selectable); when your workspace has more than one sheet the
select button stays disabled until you scope the search to a single
sheet with the filter, so a bulk action can't span sheets by accident. A "Select all" action grabs every match on the
active sheet in one tap — including matches past the 50 shown — so a
search that turns up hundreds of rows can be acted on without ticking
each one.
