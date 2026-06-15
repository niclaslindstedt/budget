# Cover transfers

Some accounts earn the best interest only as savings accounts — so they
have no card of their own. When you buy clothes, kids' things, or a new
gadget that "belongs" to one of those accounts, you pay with your main
card instead, and the expense lands on the wrong account. A **cover
transfer** reimburses those expenses from the right account and keeps a
record of exactly what it covered.

## Creating one

Select the imported transactions you want to reimburse — from a single
transaction's swipe **…** menu, or by multi-selecting several in the
budget table or in Search — and choose **Cover**. The Cover action only
appears when every selected row is an imported bank transaction; imported
transactions are the bank's truth, so the Edit / Move / Delete actions are
hidden for them (Copy still works, since it clones to fresh planning
rows).

In the modal you write a short motivation and pick the account to transfer
**from** — the list includes both regular accounts and savings accounts.
The app totals the selected expenses and generates a short reference
message (≤ 12 characters) to put on the transfer.

## Making the transfer

After you create it, an info panel shows the **amount** and the
**message**, each with a copy button, so you can paste them straight into
your bank's transfer form. Make the transfer in your bank using those two
values.

## Automatic detection

The cover transfer starts out as _not transferred yet_. The next time you
import bank history, the posted legs are matched back to it — by amount and
date, or by the reference message appearing in the transaction text — and
folded in automatically, flipping it to _transferred_ and hiding the raw
legs (just like an ordinary cross-account transfer).

## Traceability

Every transaction a cover transfer accounts for is marked with a check
glyph after its description; tapping it opens the cover transfer's info
panel, which lists all the covered transactions and the motivation. The
cover transfer itself is hidden from the ledger like any other transfer,
and tapping it opens the same panel.
