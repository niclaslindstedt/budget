import { expect, signInAsGuest, test } from "../fixtures";

// Core budget-sheet flows. After landing in guest mode the user gets
// a single "Budget" sheet with the current fiscal month already in
// view. The specs below exercise the most common manipulations:
// adding rows, editing a description, and persisting across a reload.

test.describe("Budget page", () => {
  test("renders the default sheet for a fresh guest", async ({ page }) => {
    await signInAsGuest(page);

    // The sheet title is rendered as an `<h2>`; the page-header
    // wordmark is the `<h1>` ("budget"), and a default `name:`
    // match is case-insensitive substring, so pin the level to
    // avoid matching both headings at once.
    await expect(
      page.getByRole("heading", { level: 2, name: "Budget" }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Add row/ }).first(),
    ).toBeVisible();
  });

  test("Add row button appends a new row to the current month", async ({
    page,
  }) => {
    await signInAsGuest(page);

    // The BudgetMonthTable for the current month is the first table on the
    // page. Its tbody's row count is the truth signal for "did the
    // reducer's `addRow` action land?".
    const tbody = page.locator("tbody").first();
    const rowsBefore = await tbody.locator("tr").count();

    await page
      .getByRole("button", { name: /^Add row/ })
      .first()
      .click();

    await expect(tbody.locator("tr")).toHaveCount(rowsBefore + 1);
  });

  test("description and amount persist across a reload", async ({ page }) => {
    await signInAsGuest(page);

    const tbody = page.locator("tbody").first();
    await page
      .getByRole("button", { name: /^Add row/ })
      .first()
      .click();

    // Fill both fields so the row is fully complete before the reload.
    // The pre-save filter (`isRowSavable` in `src/data/budget/rows.ts`)
    // only strips rows with no user-meaningful data at all (just the
    // column defaults), so a row with either field still persists.
    //
    // The description cell drives both viewports through the portalled
    // `DescriptionPopover` (with company picker + bank-memo line), so
    // edits go via the trigger button → popover textarea, not an
    // inline textarea in the row.
    const newRow = tbody.locator("tr").last();
    await newRow.getByRole("button", { name: "Add description" }).click();
    const description = page.getByPlaceholder("Description");
    await description.fill("Rent");
    await page.keyboard.press("Escape");

    const amountInput = newRow.locator("input[inputmode='decimal']").first();
    await amountInput.fill("1234");
    await amountInput.blur();

    // The local-adapter writes synchronously on each reducer dispatch,
    // so a reload should pick up the row.
    await page.reload();

    // Guest sessions auto-rehydrate, so the same row should render
    // after the reload without re-clicking "Continue".
    await expect(
      page.getByRole("button", { name: "Description: Rent" }).first(),
    ).toBeVisible();
    // The amount cell hides its sign in the input value — only the
    // absolute value is visible. The default sign on a new row is
    // negative (cost), so the persisted `-1234` displays as `1,234`
    // or `1234` depending on settings; matching on the digits keeps
    // the assertion stable across locale defaults.
    await expect(
      page.locator("input[inputmode='decimal']").first(),
    ).toHaveValue(/1[,. ]?234/);
  });
});
