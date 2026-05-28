---
type: Changed
---

Three algorithmic improvements that cut per-keystroke and per-modal
work in the data layer:

- The pattern-apply pass that runs after every cell edit now
  short-circuits on row reference identity (a single keystroke flips
  exactly one row's reference, so the other R−1 rows skip the cells
  comparison and candidate construction) and only allocates a new
  rows array when a rule actually overlays a label. Previously every
  keystroke paid an O(R) `.map(...)` allocation regardless.
- The merchant-key normaliser cache now evicts least-recently-used
  entries instead of FIFO, so a one-shot bulk import that fills the
  cache with one-off descriptions no longer permanently evicts the
  recurring merchants the next render still wants.
- The single-account balance lookup no longer routes through the
  workspace-wide batch helper. For a workspace with K accounts it
  used to walk every other account's history, every unrelated
  budget's rows, and every cross-account transfer; now it touches
  only the slices that affect the requested account.
