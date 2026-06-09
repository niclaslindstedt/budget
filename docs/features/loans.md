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

## Linking mortgages from the Properties sheet

Mortgages you already track on the Properties sheet don't need to be
entered twice. Pick **Link a property mortgage** when creating the
loan, choose the property, and tick the mortgages the loan covers —
one, or all of them. A property often carries several mortgages that
the bank draws as a single monthly transaction, so they list as **one
loan row**: the monthly payment and remaining balance sum across the
linked mortgages, and the rate shown is the balance-weighted blend.

Terms, payments, and balance resolve live from the property's
mortgages — linked, never copied — so the two sheets always agree.
Importing payments on a linked loan splits each bank charge across the
mortgages (amortisation settled first, like Find mortgage payments on
the Properties sheet), and the payments view lists each combined
charge as one row.

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
