---
type: Changed
---

Speed up the budget table on accounts with large imported histories: match-rule regexes are now compiled once and cached per rule, history-row label resolution looks companies and types up in an indexed map instead of scanning the arrays per entry, and the per-row entry-type lookup is now O(1) so adding a new type no longer invalidates every visible row's memo.
