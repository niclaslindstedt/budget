---
type: Changed
---

Three render-hot algorithms now scale better on large datasets:

- Formula resolution precomputes per-month aggregates and a sorted
  prefix sum once instead of re-walking every row for every formula —
  O(N log N + F²) instead of O(F × N log N).
- `coveredMonths` hoists the history-date min/max out of the per-month
  inner loop so 144-month coverage walks on a 10000-entry account
  drop from O(M × H) to O(H + M).
- Transaction search precomputes lowercase mirrors of the indexed
  fields so each keystroke is a plain `indexOf` instead of
  `.toLowerCase()` per haystack.
