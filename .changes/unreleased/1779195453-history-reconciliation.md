---
type: Added
---

Bank-history imports now reconcile with predicted budget rows. The
app prompts before merging close matches (±7 days, ±1% or ±2 SEK)
and offers to delete or move predictions that didn't post. Months
fully covered by imported history are locked — the **+ Add row**
button is hidden and date edits snap forward into the next
uncovered month. Confirming a match on a recurring series can apply
the rule to every other occurrence in the import; future imports
then collapse the same pair silently. The Settings start-of-month
field can be auto-detected from recent salary postings (uses the
latest day-of-month observed so holiday-induced early postings
don't move payday earlier than it actually lands).
