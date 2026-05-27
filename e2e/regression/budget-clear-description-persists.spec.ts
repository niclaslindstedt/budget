// Regression: clearing a budget row's description silently snapped
// back on reload. `userDataWithSavableRows` stripped the row because
// `isRowSavable` required BOTH description AND amount, which made the
// save payload smaller and tripped the 5% shrink-warning safeguard.
// The save was paused so IDB kept the pre-clear text; on the next
// load the description "came back". Fixed by relaxing `isRowSavable`
// so a row with any user-meaningful field (description, amount,
// typeId, or companyId) earns its slot in storage — the user's clear
// persists as an empty string instead of stripping the whole row.

import { expect, signInAsGuest, test } from "../fixtures";

test("clearing description persists across reload", async ({ page }) => {
  await signInAsGuest(page);

  const tbody = page.locator("tbody").first();
  await page
    .getByRole("button", { name: /^Add row/ })
    .first()
    .click();

  const newRow = tbody.locator("tr").last();
  await newRow.getByRole("button", { name: "Add description" }).click();
  const description = page.getByPlaceholder("Description");
  await description.fill("Stockholm");
  await page.keyboard.press("Escape");

  const amountInput = newRow.locator("input[inputmode='decimal']").first();
  await amountInput.fill("442");
  await amountInput.blur();

  // Give the save debounce time to land.
  await page.waitForTimeout(800);

  // Re-open the popover and clear the description — the bug was that
  // this didn't persist.
  await page
    .getByRole("button", { name: "Description: Stockholm" })
    .first()
    .click();
  const description2 = page.getByPlaceholder("Description");
  await description2.fill("");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(800);

  await page.reload();

  // The description was cleared, so the trigger button should now read
  // "Add description" (its empty-state aria-label). The row still
  // exists because the amount keeps it savable.
  await expect(
    page.getByRole("button", { name: "Add description" }).first(),
  ).toBeVisible();
  await expect(page.locator("input[inputmode='decimal']").first()).toHaveValue(
    /4[,. ]?42/,
  );
});
