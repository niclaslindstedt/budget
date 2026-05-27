---
type: Changed
---

Speed up the budget table on accounts with large imported histories: match-rule regexes are now compiled once and cached per rule, history-row label resolution looks companies and types up in an indexed map instead of scanning the arrays per entry, the per-row entry-type lookup is now O(1) so adding a new type no longer invalidates every visible row's memo, each row resolves its standard columns once per `columns` reference (instead of four array scans on every balances-map change), each month walks its rows once for select-all / hidden-transfer accounting (instead of five passes plus two array allocations), and synthesized transfer rows write their cells directly instead of looping every column in the budget.
