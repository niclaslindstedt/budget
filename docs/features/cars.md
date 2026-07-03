# Cars sheet

See what having a car actually costs — whether you own it, lease it,
share it with someone, or reach one through a car pool — on a dedicated
sheet type that links your real transportation charges to a specific
car. Give each car a glyph that matches its body type (a sports car, an
SUV, a van, a camper…) and a real paint colour — white, silver, grey,
gunmetal, black, or one of the muted automotive hues.

## Four ways to have a car

Each car records how you have access to it: **owned**, **leased**,
**shared** (co-owned with someone outside this budget — an ownership
share in percent scales what the car contributes to your net worth), or
**car pool**. Value tracking only applies where you hold capital: an
owned or shared car carries a purchase price, purchase date, and the
odometer reading at purchase. A pool car is pure running cost — its
cost is the per-use and membership charges, which arrive as linked
expenses like any other charge.

## Leasing, and why a fresh lease is "underwater"

A leased car doesn't involve a loan and you never hold its capital, but
the lease still moves your net worth. Record its terms — the **start
date**, the **length** in months, the **monthly cost**, the **interest
rate**, and the car's **value at the start and end** of the lease — and
the sheet models the lease as a level-payment plan: your fixed monthly
payment is mostly interest early on, so the amount you have paid down
grows slowly at first and fast toward the end. Meanwhile the car itself
loses value fastest in the first months. Because value falls faster than
the lease is paid down, a fresh lease is **underwater** — the car is
worth less than what you are still committed to — so it drags your net
worth down early in the term, and the gap closes back to zero by the
end. The car card shows this live as a **Net position** figure, and the
Insights net worth folds it in.

## Linking your real costs

The point of the sheet is that the costs are _real_, not estimated.
**Find car expenses** sweeps your imported bank history for the charges
that are genuinely car costs — fuel, parking, car insurance, vehicle
tax, congestion tax, leasing, service, and car pool — using the same
category resolution the budget tables use, so a merchant you
tagged once (or that a match rule / merchant memory recognises) shows
up automatically. The scan is bounded to the dates you actually had the
car — from the purchase (or lease start) to the sale (or lease end) —
so a charge from before you bought it or after you sold it never
appears. Taxi and public transport are left out on purpose: they are
alternative ways to travel, not the cost of owning _this_ car. Tick the
charges that belong to the car and add them in one go. A charge that
isn't a car cost can be **ignored** (that one charge never resurfaces)
or **excluded as similar** (every past and future charge with the same
description disappears from the scan). Both lists are clearable from
Settings. Costs with no bank trace — cash fuel, expenses predating your
imported history, a car-pool invoice on someone else's account — can be
added manually.

## Value and mileage in one step

A second-hand-market lookup (say, Blocket) prices a car by model, year,
and mileage — and the mileage is the only one of those that changes. So
**Update value & mileage** records both in one dated snapshot: enter
the value you found and the odometer reading you checked anyway. Either
half is optional — a plain odometer check between lookups is just as
valid. The latest recorded value wins over any computed figure; until
one exists, an optional **value-loss curve** (steady percent per year,
or an accelerated curve with an instant drive-off-the-lot drop and a
steeper first year) decays the purchase price, with an optional floor.

## The real cost, in three legs

The cost view keeps the legs separate so you can see what dominates:

- **Expenses** — everything you linked: fuel, insurance, tax, parking,
  service, leasing fees.
- **Depreciation** — value lost since purchase, from the curve or your
  recorded lookups. Owned and shared cars only.
- **Loan interest** — link the car to its loan on the Loans sheet and
  the interest accrued so far joins the total. Amortisation is
  deliberately _not_ a cost: it's your own money moving from the bank's
  pocket to yours.

The cost chart stacks the linked expenses per month by type, with the
depreciation and interest legs as toggleable bands. The value chart
draws the car's value over time — with toggles to subtract the running
costs and interest, showing what the car has really consumed — plus
your odometer readings. And once mileage is tracked, the headline
figure appears: **cost per kilometre**, the sum of all three legs
divided by the distance you have actually driven.

Owned and shared cars count in the Insights sheet's net worth as their
current value (times your share); a leased car with recorded terms
counts as its net position (negative while it's underwater); a sold car
(record the date and the proceeds) stops counting and moves to the sold
section.

## Keeping the paperwork

Every car collects paperwork — the purchase agreement when you buy it, a
leasing contract if you lease, the sale contract when you move it on.
Open **Contracts** from a car's "…" menu to attach those documents (a
photo or PDF): tag each with its kind and an optional description, and it
is saved in a per-car folder on your storage. View, replace, or delete a
contract from the same panel. Like receipts and property files, contracts
need a local-folder or cloud backend to store the bytes — on plain
browser storage the list still shows but the upload button is hidden.
