---
type: Fixed
---

The column-header labels really are hidden on phones held in
landscape now — the prior fix landed in the wrong cascade layer
and Tailwind's `md:inline` utility kept overriding it.
