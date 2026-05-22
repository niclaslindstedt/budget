---
type: Changed
---

Edit-transaction modal: when a transaction was created by collapsing two
imported bank-history entries, the date, amount, accounts, and
"mark as done" flag are now read-only — the bank statement is the
source of truth. Only the description and type stay editable. A new
"This is a transfer" toggle demotes the pair back to two stand-alone
history entries (with confirmation). The transfer icon now sits on the
same row as the modal title.
