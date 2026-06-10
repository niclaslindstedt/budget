# Loans sheet

Track the money you owe — student loans, car loans, mortgages, money
borrowed from a person — on a dedicated sheet type, with payments pulled
straight from your imported bank transactions.

## What a loan records

Each loan carries a type, a start date, a start sum, and optionally an
annual interest rate and a setup fee (_uppläggningsavgift_). A
**student loan** is the exception: CSN debt builds up over the study
years, so there is no single starting principal to enter — record what
you owe with Update balance instead (see below). The lender field
follows the type:

- a **personal loan** names the person you borrowed from,
- a **private loan** or **car loan** names the lending company,
- a **student loan** needs no lender (it's CSN),
- a **mortgage** can name no lender at all — or link a property's
  mortgage instead (see below).

The loans table shows each loan's type, monthly payment, rate, what
you've paid so far, and what remains — with a total of remaining debt
across all loans at the bottom. Tap a row to open the loan's details:
the lender or linked mortgages, the entered terms, the same derived
figures, and the recorded payments, with an Edit shortcut. The monthly
payment isn't entered anywhere: it's calculated from the recorded
payments — the average over this year's payment months, or the three
most recent ones while the year is still young.

## Remaining balance

The balance starts from the loan's start sum (plus the financed setup
fee) on its start date and follows the recorded payments from there.
Whenever you want to re-sync it against reality — a statement arrived,
or payments weren't imported for a while — use **Update balance** on
the loan row's "…" menu: enter the outstanding debt and the date it was
true. The remaining balance at any date is then calculated from the
latest recorded balance and the payments since. Older snapshots stay
listed in the same modal and can be deleted. For a student loan this is
the only balance source, since that kind has no start sum.

With a rate set, the calculation walks month by month: each month
accrues interest on the outstanding balance, and the payments that
month net of that interest amortise the principal — so the figure
honestly reflects that early payments are mostly interest. Without a
rate, every recorded payment amortises in full.

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

Marking one transaction is enough. The modal's **Suggested similar
payments** section finds the rest of the loan's history for you:
transactions with a matching bank description whose amount is within
±10% of a marked charge. A slider adjusts the tolerance (0–50%) when
the instalment has drifted more — say, after a rate change.

Metadata flows both ways. Two checkboxes — both on by default — tag
the imported transactions with the loan's type and rename them to the
loan's name, so the bank history gets tidier with every import. The
original bank text is kept underneath, like any manual rename. (On a
linked mortgage loan, suggestions and the checkboxes don't apply —
payments and metadata belong to the Properties sheet there.)

Importing also remembers the bank description. The next time you import
a bank statement, matching charges attach to the loan automatically —
no modal, no clicks. Payments live behind **View payments** on the same
menu, where individual records can be deleted.

## The Loans category

All five loan types live under the new **Loans** preset category, so
spending analysis can group debt service in one bucket. The existing
Mortgage and Student loan types moved in from Housing and Bills — any
transactions already tagged with them keep working unchanged.
