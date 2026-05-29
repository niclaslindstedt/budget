import { expect, signInAsGuest, test } from "../fixtures";

// Tiered category → entry-type picker. Tapping the type cell on a row
// surfaces the workspace's categories first; tapping a category slides
// in the types within it. The previous flat list with "Most used" /
// "Unused" dividers has been replaced — these specs lock in the new
// two-tier flow.

test.describe("Entry-type picker", () => {
  test("walks the category → type tiers and updates the cell", async ({
    page,
  }) => {
    await signInAsGuest(page);

    // Fresh row, default columns include the `type` cell with a
    // dashed-pill chip whose aria-label is "Add type". Description +
    // amount stay empty: the picker doesn't need a savable row.
    await page
      .getByRole("button", { name: /^Add row/ })
      .first()
      .click();

    const tbody = page.locator("tbody").first();
    const newRow = tbody.locator("tr").last();
    const trigger = newRow.getByRole("button", { name: "Add type" });
    await trigger.click();

    // The category pane shows one preset category per group with at
    // least one type — "Housing" and "Income" both ship as defaults
    // in `PRESET_CATEGORIES`. Types are NOT visible at this tier.
    const housing = page.getByRole("option", { name: /Housing/ });
    const income = page.getByRole("option", { name: /Income/ });
    await expect(housing).toBeVisible();
    await expect(income).toBeVisible();
    await expect(
      page.getByRole("option", { name: /^Rent \/ Fee$/ }),
    ).toHaveCount(0);
    await expect(page.getByRole("option", { name: /^Salary$/ })).toHaveCount(0);

    // Tap "Housing" → the type pane slides in. "Rent / Fee" lives in
    // Housing; "Salary" lives in Income and must stay hidden.
    await housing.click();
    await expect(
      page.getByRole("option", { name: /^Rent \/ Fee$/ }),
    ).toBeVisible();
    await expect(page.getByRole("option", { name: /^Salary$/ })).toHaveCount(0);

    // Back row returns to the category list.
    await page.getByRole("button", { name: "All categories" }).click();
    await expect(housing).toBeVisible();
    await expect(
      page.getByRole("option", { name: /^Rent \/ Fee$/ }),
    ).toHaveCount(0);

    // Pick a type → the picker closes and the cell adopts the chip.
    await housing.click();
    await page.getByRole("option", { name: /^Rent \/ Fee$/ }).click();
    await expect(
      page.getByRole("option", { name: /^Rent \/ Fee$/ }),
    ).toHaveCount(0);
    // The chip is rendered inside the type cell's trigger button. Scope
    // to the type picker (its trigger is the row's only listbox button)
    // because an empty description cell mirrors the type name as its
    // fallback label, so a bare /Rent/ match is ambiguous across cells.
    const typeTrigger = newRow.locator('button[aria-haspopup="listbox"]');
    await expect(typeTrigger).toContainText("Rent");

    // Re-opening the picker on a labelled row jumps straight into
    // that type's category with the existing selection checkmarked.
    await typeTrigger.click();
    const rentOption = page.getByRole("option", { name: /^Rent \/ Fee$/ });
    await expect(rentOption).toBeVisible();
    await expect(rentOption).toHaveAttribute("aria-selected", "true");
  });
});
