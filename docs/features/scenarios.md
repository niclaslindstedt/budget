# Scenarios sheet

Play what-if futures against a budget you already track — lose a job,
buy a car, drop a subscription — without ever changing the real
budget.

## How it works

A Scenarios sheet models on **one base budget**: pick any of your
budget sheets when the page first opens (and change it later from the
sheet's Edit modal). Everything you then see is computed live from
that budget — when you edit the real budget, every scenario follows
along automatically.

The **Baseline** is always there: your budget exactly as it is, with
nothing changed. Every scenario you create is a set of changes on top
of that reality:

- **Change a value** — tap an amount in the scenario's table and type
  a new one. Only that row, only in that scenario. An overridden row
  shows in the accent color, with a revert control to undo the change.
  Editing a recurring entry asks whether the upcoming entries in the
  same series should change too — apply to all of them, stop after a
  date, or keep it to just this one. (Descriptions stay as they are —
  a scenario changes what a row costs, not what it's called.)
- **Adjust a value** — instead of typing a fixed number, attach a live
  adjustment from the row's action strip: add an amount ("what if I
  get a 5 000 kr raise?"), subtract an amount ("what if I cut 500 kr
  off groceries?"), multiply ("what if rent doubles?"), or change by
  percent ("what if gas goes up 300 %?"). The adjustment
  stays linked to the real budget: when the underlying entry changes
  there, the scenario recomputes from the new amount automatically. A
  small ×2 / +5 000 token next to the amount shows the rule that's in
  effect, and recurring entries offer the same apply-to-upcoming sweep
  as a typed value.
- **Drop a row** — exclude an expense you wouldn't keep ("if I lose my
  job, the gym goes"). Excluded rows stay visible, struck through, and
  contribute nothing to the balances. Excluding a recurring entry asks
  whether the upcoming entries in the same series should go too — and
  bringing one back offers to restore the rest the same way.
- **Add a row** — bring in money or costs that don't exist in the real
  budget, like an unemployment benefit or a new car payment. The date
  field is a full recurrence picker, so the addition can be one-off or
  recurring — a single date, a hand-picked list, every N days, or a
  monthly / quarterly / yearly cadence — and the whole series lands in
  the scenario at once. Deleting one occurrence of a recurring
  addition offers to take the rest of the series with it.

The month tables work like the budget sheet — date, description,
type, amount, running balance, grouped by fiscal month, with the same
recurring markers, company / type labels, and (when "Hide transfers
between accounts" is on) the same transfer collapse — and start at
the current month (your bank-covered past can't change anyway); a
"Show earlier months" line reveals the full history. Types are shown
for context but can't be changed from a scenario. Every change is
color-coded in place: added rows tint green, excluded rows red, and
overridden values yellow.

## The chart

Open **Visualize scenarios** from the sheet's "…" menu. One line chart
draws the **monthly end balance** of the Baseline and every scenario
at once — the dashed line is the Baseline, and each scenario gets its
own color (the same dot shown next to its name in the scenario
dropdown). The chart looks strictly
forward: pick how far into the future it runs with the 1M / 3M / 6M /
1Y / 2Y buttons, counted from the current month. Click a name in the
legend to hide or show that line. This is where "can the economy
handle it?" gets its answer at a glance.

## Balance monitors

Add a **monitor date** — say 31 December — with the "+" button next
to the Balance monitors title, and a card shows how much money each
variant projects on that day, with each scenario's difference against
the Baseline. Add as many dates as matter to you.

## Viewing changes

Open **View changes** from the sheet's "…" menu to see the active
scenario as a diff against the Baseline: changed rows as old → new,
excluded rows struck through, added rows marked with a plus.

## Good to know

- The real budget is never touched. Scenario changes live on the
  Scenarios sheet only, and deleting a scenario only deletes its
  changes.
- Changing the base budget clears every scenario's changes (they
  belong to the old budget's rows) — the Edit-sheet modal warns
  first.
- Scenarios are hypothetical, so they never count toward the Insights
  sheet's net worth.
