# Properties sheet

Track the homes and apartments you own — what each is worth, the mortgages
held against it, the work you've put into it, and the documents that prove
it — all on a dedicated sheet type.

## What a property records

Each property tracks what it was bought for, its size, its number of rooms,
its monthly fee (the recurring charge to hold it, like a bostadsrätt
_avgift_), and its value over time. Record a new value any time to add a
point to its history. When a size is recorded, the current value shows a
per-area figure (e.g. `102k/kvm`) and the fee a yearly per-area figure
(e.g. `587 kr/kvm/yr`). A property also names its lender — the bank its
mortgages are held with — and the mortgages themselves.

Choose whether sizes read as **kvm** or **sqm** in the Property settings
tab.

## Mortgages

For each mortgage you can record:

- the sum you borrowed,
- the current balance,
- the amortisation — a percentage of the initial loan, or a fixed sum per
  month,
- how often the loan is paid — monthly by default, or quarterly / every 6
  months / yearly,
- when the loan started,
- a history of interest-rate changes, so older payments are valued at the
  rate that was in effect then.

The mortgage card and the payments view break each total down into interest
and amortisation, so a loan carrying all the principal is obvious instead of
hidden in a single number. The card also shows the interest the loan is
accruing right now — its rate applied to what's still owed — alongside the
monthly amortisation.

A mortgage card shows a payoff **power bar** — how much of the original loan
you've amortised away, filling to a green 100% when the balance reaches zero
and the loan is fully paid off. Press the bar to expand the
interest-and-amortisation breakdown of what you've paid. Paying one off all
the way unlocks the **Mortgage Free** achievement.

When a property carries more than one mortgage, the card opens in a unified
view that sums every loan into one picture — combined balance and debt, a
blended effective rate, and the total monthly interest and amortisation. The
combined balance also shows, as a percentage, how much of what you paid for
the property is tied up in loans — the loan-to-value the bank reads (e.g.
`6 028 400` with an `82%` pill beside it). A two-glyph toggle in the
mortgage section header switches to a split view to see each loan on its own;
the active mode slides between the glyphs as you press it.

**View payments** and **Find mortgage payments** are buttons in that header
beside the toggle, while **Add mortgage** lives in the property's "…" menu.

## Find mortgage payments

Give the property a bank account and open **Find mortgage payments** from the
button in its mortgage section. It scans that account's history for the
single monthly charge that pays its loans:

- It homes in on the charges you tagged with a lender or the **Mortgage**
  type, learns their bank description, and sweeps the rest of the history for
  every matching month — ranking the likeliest first, leaving a previous
  home's loan out by its different amount, and ignoring charges that are
  nowhere near what the loan's amortisation and interest add up to.
- A charge that recurs on the loan's cadence under the same description, for
  an amount that matches the expected payment, **and** that has been charged
  for every period since the loan started is flagged **"Highly probable"**
  and stands out at the top of the list. That steady, complete rhythm is the
  surest sign it's the mortgage, so it outranks even a charge you tagged.
- When any charge is flagged this way, only those are ticked for you to begin
  with — the weaker candidates are left for you to add deliberately. When
  nothing is flagged, every charge found is ticked as before.
- A charge that recurs cleanly but only covers part of that span — say five
  of the eight months since you took the loan out — stays an ordinary
  candidate instead. When two charges match the same expected amount only the
  strongest is flagged, so look-alikes don't all light up.

Haven't tagged anything yet? As long as the loan's terms are filled in, the
finder still picks out the charges whose amount matches the expected monthly
payment, so a freshly imported account turns up its mortgage straight from
the maths.

Each found transaction is split across the property's mortgages by their
amortisation and interest, recording one payment per loan that adds up to
exactly what was paid.

## Payments view

Open a property's payments to review every recorded charge and how it split
across the loans. Tap a charge to see the original bank transaction it came
from. Edit or remove individual payments — change one loan's share and the
others re-balance so the total still matches the bank — or clear every
recorded payment in one go to re-run the finder from scratch.

The payments view also flags anything left unaccounted for when the
amortisation you've recorded doesn't add up to the drop from the original
loan to the current balance — a hint that a payment is missing or a figure is
off.

## Value history

Record a new value any time by tapping the property's current value on its
card. What you paid is the property's first value automatically — the
purchase price shows in the value history (tagged **"Purchase"**) at the
purchase date, so a new property already has a value without recording one,
and editing the purchase amount moves it.

**Visualize value** is its own button on the property card's header. It
charts the recorded values as a line graph, with toggles to fold in the money
spent on repairs and to overlay the net value you'd actually take home after
broker, advertising, repairs, purchase price, and capital-gains tax. A dotted
purchase-value line sits underneath the value and "with repairs" views, so
the gap above it reads as your profit at a glance. The chart follows your
theme — colours, font, corners, and spacing all match.

Every other per-property action — estimate a sale, edit, delete — lives
behind a single "…" menu beside the header buttons, so the header stays tidy
as the feature grows.

## Net sale profit

Estimate what a sale would net you with the **Net sale profit** calculator
(in a property's "…" menu). Drag a slider to try different sale prices and
watch a live breakdown — broker fee, advertising, repairs and renovations,
and the original purchase price all come off, then capital-gains tax, ending
in a net profit or loss that stands out in green or red.

The broker fee can be a flat amount, a percentage of the sale, or a base fee
plus a percentage above a threshold — or skipped entirely. The tax follows
your **Location**, a setting under General that decides which country's tax
rules apply (to property sales and your salary); only Sweden is built in
today, with a link to request more.

## Repairs and renovations

Each property tracks its **repairs and renovations** — open the wrench view
from its button on the property card to add any bank charge you tagged
**Repairs** or **Renovations**, across all your accounts.

Add one at a time with a description of the work ("repainted the kitchen"), a
subtype that classifies it, and the company and tags it was with — or
quick-add several charges in one go and fill in the details later. Company
and tags are saved on the underlying transaction, so they also enrich your
budget, and tagging lets you group repairs together across properties. The
wrench view lists each repair with its full date, company, and tags.

Attach the receipts to the repair and the cost is ready for a future tax
deduction; a repair with no receipt is flagged **"missing receipt"** so the
paperwork doesn't slip. A big job is rarely one invoice — a deposit at the
start, a balance at the end, staged payments over a year — so open **Manage
receipts** to attach several, each with its own date (it defaults to the
repair's date). When one invoice was paid across several bank charges, tick
every transaction in the repair editor to group them under a single repair:
their amounts add up. The same transaction can't back two repairs.

Older work that predates the bank history you imported needn't be left out —
choose **Add manually** in the wrench view to record a repair with no
transaction behind it: enter the type, date, amount, description, contractor,
and tags directly (stored on the repair itself), and attach receipts just the
same.

Swipe a repair left to edit its transactions, description, subtype, company,
and tags, manage its receipts, or delete it. Repair receipts are saved into
the property's own receipts folder, each named for its date, company, and the
work done, so the folder reads like a dated log of everything done to the
home. Change a receipt's date, a repair's company or description, or rename
the property, and the receipt files are renamed to match.

## Files

Beyond receipts, **upload any file to a property** — choose **Upload file**
from a property's "…" menu to attach a photo or PDF: before and after
pictures, an inspection report, an insurance document, anything that isn't a
receipt. Give each file a description and tags, and sort it into a
**category** you name (insurance, manuals, …) that becomes its own subfolder.

Files open in the same viewer as receipts, and you can edit their details,
replace, or delete them. Mark a file **private** to keep it out of an export.
Manage your file categories in the Property settings tab. Each property keeps
its receipts and files together under a per-property folder on your storage.

## Export and import

Selling a home? **Export a property** from its "…" menu to bundle everything
about it — its details, repairs, receipts, and uploaded documents — into a
single file to hand to the new owner, who brings it into their own Properties
sheet with **Import property** from the sheet's "…" menu (it lands as a
brand-new property).

Choose what goes in the bundle: receipts are included by default, files you
marked private are left out unless you opt in, and your own financial records
— the mortgages, their payment history, the purchase price, and value
estimates — stay out unless you choose to include them. Choose where it goes,
too: download the file to your device, or — when you've connected a folder or
cloud storage — save it straight into an `exports/` folder there.
