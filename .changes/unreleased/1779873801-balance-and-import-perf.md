---
type: Changed
---

Three more hot algorithms now scale better on large datasets:

- The Accounts page computes every account's balance in a single pass
  over the workspace instead of re-walking every sheet, transfer, and
  history entry once per account — O(R + T + H) instead of
  O(A × (R + T + H)).
- Bank-import reconciliation indexes budget rows by `seriesId` so the
  rule-driven matcher only scans rows of the rule's own series instead
  of the entire row list per (rule, entry) pair.
- The plain reconciliation matcher sorts rows by absolute amount once
  and binary-searches the tolerance band per incoming entry, so large
  imports drop from O(E × R) to O((E + R) log R + E × band).
