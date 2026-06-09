# Loans sheet

Track the money you owe — student loans, car loans, mortgages, money
borrowed from a person — on a dedicated sheet type, with payments pulled
straight from your imported bank transactions.

## What a loan records

Each loan carries a type, a start date, a start sum, a monthly payment,
and optionally an annual interest rate and a setup fee
(_uppläggningsavgift_). The lender field follows the type:

- a **personal loan** names the person you borrowed from,
- a **private loan** or **car loan** names the lending company,
- a **student loan** needs no lender (it's CSN),
- a **mortgage** can name no lender at all — or link a property's
  mortgage instead (see below).

The loans table shows each loan's monthly payment, rate, what you've
paid so far, and what remains — with a total of remaining debt across
all loans at the bottom.

## Remaining balance

With a rate set, the remaining balance is simulated month by month from
the start date: each month accrues interest on the outstanding balance,
and the monthly payment net of that interest amortises the principal.
The setup fee is treated as financed into the loan. So the figure
honestly reflects that early payments are mostly interest. Without a
rate, the balance is simply the start sum (plus fee) minus the payments
recorded.

## Linking a mortgage from the Properties sheet

A mortgage you already track on the Properties sheet doesn't need to be
entered twice. Pick **Link a property mortgage** when creating the
loan: terms, payments, and balance then resolve live from the property's
mortgage — linked, never copied — so the two sheets always agree.
Importing or deleting payments on a linked loan reads and writes the
mortgage's own payment list.

## Importing payments

Mark bank transactions with the loan's type — Student loan, Car loan,
Private loan, Personal loan, Mortgage — and they surface in **Import
payments** on the loan row's swipe "…" menu. Tick the charges that
belong to the loan and import: each becomes a dated payment linked to
its bank row, so re-imports never double-count.

Importing also remembers the bank description. The next time you import
a bank statement, matching charges attach to the loan automatically —
no modal, no clicks. Payments live behind **View payments** on the same
menu, where individual records can be deleted.

## The Loans category

All five loan types live under the new **Loans** preset category, so
spending analysis can group debt service in one bucket. The existing
Mortgage and Student loan types moved in from Housing and Bills — any
transactions already tagged with them keep working unchanged.
