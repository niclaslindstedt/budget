# Import values from a file

Tracking how something's worth changes over time — an item that
appreciates, a property's market value, a savings balance, a loan's
remaining debt, a holding or a stock price — used to mean typing each
dated snapshot into the "Update value / balance" modal one at a time. If
you already have that history in a spreadsheet or a broker / bank export,
that's a lot of re-typing.

Now every one of those modals has an **Import from file** button.

## How it works

1. Open the **Update value** (or **Update balance** / **Update price**)
   modal for the thing you're tracking and click **Import from file**.
2. Drop in — or browse to — a **CSV** or **Excel (`.xlsx`)** file.
3. The file appears as a grid. The importer guesses which column holds
   the **dates** and which holds the **values** and highlights them — the
   date column in the accent colour, the value column in green.
4. If a guess is wrong, switch the role toggle and click the correct
   column header. One column is the date, one is the value.
5. The two highlighted columns are previewed exactly as they'll import:
   the date column shows each parsed date in your chosen date format, the
   value column shows each parsed number. Rows the importer can't read
   (a missing date, text where a number should be) are dimmed and won't
   be imported, and a count tells you how many will land and how many
   were skipped.
6. Click **Import** and every readable row is added at once.

## Dates in any format

You don't have to reformat the file first. The importer reads ISO dates
(`2024-01-15`), year-first (`2024/01/15`), day- or month-first
(`15/01/2024`, `01/15/2024`), two-digit years, Excel serial numbers, and
month names in English and Swedish (`15 Jan 2024`, `15 maj 2024`). When a
numeric column is ambiguous (is `03/04` the 3rd or the 4th?), it looks
across the whole column for an unambiguous row to settle the order, and
otherwise follows the date format in your settings.

## Re-importing is safe

Importing merges by date: a date already in the history is updated to the
imported value, and dates that aren't in the file are left alone. So you
can re-import an updated export without creating duplicates, and a manual
snapshot you added by hand survives unless the file covers the same day.
The whole import is a single step in Action history, so one undo reverses
it.
