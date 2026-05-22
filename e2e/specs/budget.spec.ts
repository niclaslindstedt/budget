import { expect, signInAsGuest, test } from "../fixtures";

// Core budget-sheet flows. After landing in guest mode the user gets
// a single "Sheet 1" with the current fiscal month already in view.
// The specs below exercise the most common manipulations: adding rows,
// editing a description, and persisting across a reload.

test.describe("Budget sheet", () => {
  test("renders the default sheet for a fresh guest", async ({ page }) => {
    await signInAsGuest(page);

    await expect(page.getByRole("heading", { name: "Sheet 1" })).toBeVisible();
    await expect(
      page.getByRole("button", { name: /^Add row/ }).first(),
    ).toBeVisible();
  });

  test("Add row button appends a new row to the current month", async ({
    page,
  }) => {
    await signInAsGuest(page);

    // The MonthTable for the current month is the first table on the
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

    // Pre-save filter (`isRowSavable` in `src/data/sheet.ts`) requires
    // both a description AND an amount before the row is persisted.
    // Half-done rows are kept in memory for the user's convenience
    // but stripped on every storage write, so a description-only row
    // would silently vanish on reload — fill both fields here so the
    // row reaches the on-disk snapshot.
    const newRow = tbody.locator("tr").last();
    const description = newRow.locator("textarea").first();
    await description.fill("Rent");
    await description.blur();

    const amountInput = newRow.locator("input[inputmode='decimal']").first();
    await amountInput.fill("1234");
    await amountInput.blur();

    // The local-adapter writes synchronously on each reducer dispatch,
    // so a reload should pick up the row.
    await page.reload();

    // Guest sessions auto-rehydrate, so the same row should render
    // after the reload without re-clicking "Continue".
    await expect(page.locator("textarea").first()).toHaveValue("Rent");
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
