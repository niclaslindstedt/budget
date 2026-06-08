---
type: Added
---

New **Properties** sheet — track the homes and apartments you own: what
each was bought for, its size, its monthly fee (the recurring charge to
hold it, like a bostadsrätt avgift), its value over time (record a new
value any time to add a point to its history), the lender (the bank its
mortgages are held with), and the mortgages themselves. For each mortgage
you can record the sum you borrowed, the current balance, the amortisation
(a percentage of the initial loan or a fixed sum per month), how often the
loan is paid (monthly by default, or quarterly / every 6 months / yearly),
when the loan started, and a history of interest-rate changes so older
payments are valued at the rate that was in effect then. Give the property a bank account and open "Find mortgage
payments" from
the sheet's "…" menu: pick a property and it scans that account's history
for the single monthly charge that pays its loans — homing in on the
charges you tagged with a lender or the Mortgage type, learning their bank
description, and sweeping the rest of the history for every matching month,
ranking the likeliest first, leaving a previous home's loan out by its
different amount, and ignoring charges that are nowhere near what the loan's
amortisation and interest add up to. A charge that recurs on the loan's
cadence under the same description, for an amount that matches the expected
payment, AND that has been charged for every period since the loan started
is flagged "Highly probable" and stands out at the top of the list — that
steady, complete rhythm is the surest sign it's the mortgage, so it outranks
even a charge you tagged. When any charge is flagged this way, only those are
ticked for you to begin with — the weaker candidates are left for you to add
deliberately — and when nothing is flagged, every charge found is ticked as
before. A charge that recurs cleanly but only covers part
of that span — say five of the eight months since you took the loan out —
stays an ordinary candidate instead, and when two charges match the same
expected amount only the strongest is flagged, so look-alikes don't all
light up. Haven't tagged anything yet? As long
as the loan's terms are filled in, the finder still picks out the charges
whose amount matches the expected monthly payment, so a freshly imported
account turns up its mortgage straight from the maths. Each found transaction is split across the property's
mortgages by their amortisation and interest, recording one payment per
loan that adds up to exactly what was paid. Both the mortgage card and the
payments view break each total down into interest and amortisation, so a
loan carrying all the principal is obvious instead of hidden in a single
number; the card also shows the interest the loan is accruing right now —
its rate applied to what's still owed — alongside the monthly amortisation.
When a property carries more than one mortgage the card opens in a unified
view that sums every loan into one picture — combined balance and debt, a
blended effective rate, and the total monthly interest and amortisation —
with the combined balance also showing, as a percentage, how much of the
property's current value is tied up in loans (e.g. 6 028 400 (82%)), and a
"…" menu in the mortgage section (where "Add mortgage" and "View payments"
now live) to switch to a split view and see each loan on its own.
Open a property's payments to
review every recorded charge and how it split across the loans — tap a
charge to see the original bank transaction it came from — and edit or
remove individual payments — change one loan's share and the others
re-balance so the total still matches the bank — or clear every recorded
payment in one go to re-run the finder from scratch. The payments view also
flags anything left unaccounted for when the amortisation you've recorded
doesn't add up to the drop from the original loan to the current balance —
a hint that a payment is missing or a figure is off. A property can carry several
mortgages. Choose whether sizes read as "kvm" or "sqm" in the Property
settings tab.

Record a new value any time by tapping the property's current value on
its card. What you paid is the property's first value automatically — the
purchase price shows in the value history (tagged "Purchase") at the
purchase date, so a new property already has a value without recording
one, and editing the purchase amount moves it. Every other per-property
action — estimate a sale, view
repairs, edit, delete — lives behind a single "…" menu on the property
card, so the header stays tidy as the feature grows.

Estimate what a sale would net you with the new **Net sale profit**
calculator (in a property's "…" menu): drag a slider to try different
sale prices and watch a live breakdown — broker fee, advertising,
repairs and renovations, and the original purchase price all come off,
then capital-gains tax, ending in a net profit or loss that stands out in
green or red. The broker fee can be a flat amount, a percentage of the
sale, or a base fee plus a percentage above a threshold — or skipped
entirely. The tax follows your **Location**, a new setting under General
that decides which country's tax rules apply (to property sales and your
salary); only Sweden is built in today, with a link to request more.

Each property also tracks its **repairs and renovations** — open the
wrench view from a property's "…" menu to add any bank charge you tagged
Repairs or Renovations, across all your accounts. Add one at a time with a
description of the work ("repainted the kitchen"), a subtype that
classifies it, and the company and tags it was with — or quick-add
several charges in one go and fill in the details later. Company and
tags are saved on the underlying transaction, so they also enrich your
budget, and tagging lets you group repairs together across properties.
The wrench view lists each repair with its full date, company, and tags.
Attach the receipts to the repair and the cost is ready for a future tax
deduction; a repair with no receipt is flagged "missing receipt" so the
paperwork doesn't slip. A big job is rarely one invoice — a deposit at the
start, a balance at the end, staged payments over a year — so open **Manage
receipts** to attach several, each with its own date (it defaults to the
repair's date). When one invoice was paid across several bank charges, tick
every transaction in the repair editor to group them under a single repair:
their amounts add up. The same transaction can't back two repairs. Older
work that predates the bank history you imported needn't be left out —
choose **Add manually** in the wrench view to record a repair with no
transaction behind it: enter the type, date, amount, description,
contractor, and tags directly (stored on the repair itself), and attach
receipts just the same. Swipe a repair left to edit its transactions,
description, subtype, company, and tags, manage its receipts, or delete it.
Repair receipts are saved into the property's own receipts folder, each
named for its date, company, and the work done, so the folder reads like a
dated log of everything done to the home; change a receipt's date, a
repair's company or description, or rename the property, and the receipt
files are renamed to match.

Beyond receipts, **upload any file to a property** — choose **Upload
file** from a property's "…" menu to attach a photo or PDF: before and
after pictures, an inspection report, an insurance document, anything
that isn't a receipt. Give each file a description and tags, and sort it
into a **category** you name (insurance, manuals, …) that becomes its own
subfolder. Files open in the same viewer as receipts, and you can edit
their details, replace, or delete them. Mark a file **private** to keep
it out of an export. Manage your file categories in the Property settings
tab. Each property keeps its receipts and files together under a
per-property folder on your storage.

Selling a home? **Export a property** from its "…" menu to bundle
everything about it — its details, repairs, receipts, and uploaded
documents — into a single file to hand to the new owner, who brings it
into their own Properties sheet with **Import property** from the sheet's
"…" menu (it lands as a brand-new property). Choose what goes in the
bundle: receipts are included by default, files you marked private are
left out unless you opt in, and your own financial records — the
mortgages, their payment history, the purchase price, and value
estimates — stay out unless you choose to include them. Choose where it
goes, too: download the file to your device, or — when you've connected a
folder or cloud storage — save it straight into an exports/ folder there.
