import { expect, signInAsGuest, test } from "../fixtures";

// Pattern-rule visibility and reordering flow. Exercises the
// user-visible affordances added when "exact" amount mode and the
// up/down reorder buttons landed in the Patterns settings tab.
//
// Matcher correctness for the underlying `amountMin === amountMax`
// collapse lives in tests/match_rules_test.ts; this spec only
// asserts that the chip text and the reorder buttons reach the DOM
// and act on the rules the user can see.

async function addRow(
  page: import("@playwright/test").Page,
  description: string,
  amount: string,
): Promise<void> {
  const tbody = page.locator("tbody").first();
  const before = await tbody.locator("tr").count();
  await page
    .getByRole("button", { name: /^Add row/ })
    .first()
    .click();
  await expect(tbody.locator("tr")).toHaveCount(before + 1);

  // The empty row lands at the end of the tbody (it picks up today's
  // date and an empty amount, so the sort hasn't moved it yet). Fill
  // description and amount before either cell commits — once both
  // commit the row re-sorts, but we've already captured the input
  // refs so `.last()` is still pointing at it.
  //
  // Description goes through the portalled `DescriptionPopover` on
  // every viewport — click the row's trigger, fill the popover's
  // textarea, then dismiss it before falling through to the amount.
  const newRow = tbody.locator("tr").last();
  await newRow.getByRole("button", { name: "Add description" }).click();
  await page.getByPlaceholder("Description").fill(description);
  await page.keyboard.press("Escape");
  const amt = newRow.locator("input[inputmode='decimal']").first();
  await amt.fill(amount);
  await amt.blur();
  // The AmountCell stays "active" after blur because ActiveRowProvider
  // keeps the cell's DismissBackdrop mounted until a pointer-down
  // outside the active region clears it. The backdrop (see
  // src/components/DismissBackdrop.tsx) is a full-screen click-
  // swallower that would otherwise intercept the next pointer event
  // and silently dismiss instead of clicking the intended target.
  // Click the backdrop, then wait out the 300 ms trailing-swallow
  // window the backdrop installs to keep the dismiss tap from
  // double-firing on whatever was underneath.
  const backdrop = page.locator("[data-active-portal]");
  if (await backdrop.count()) {
    await backdrop.first().click();
    await page.waitForTimeout(350);
  }
}

async function openRowMenu(
  page: import("@playwright/test").Page,
  description: string,
): Promise<void> {
  const tbody = page.locator("tbody").first();
  const row = tbody.locator("tr").filter({ hasText: description }).first();
  await row.getByRole("button", { name: "More actions" }).click();
}

test.describe("Pattern rules — exact mode and reorder", () => {
  test("Exact mode persists a single amount and the chip surfaces it", async ({
    page,
  }) => {
    await signInAsGuest(page);

    await addRow(page, "APPLE.COM/BILL", "39");
    await openRowMenu(page, "APPLE.COM/BILL");
    await page.getByRole("menuitem", { name: "Label similar" }).click();

    // The modal seeds Pattern with *APPLE.COM/BILL* and signMode with
    // "negative" (the seed row's direction). Switching to Exact picks
    // up the seed's amount magnitude automatically because the
    // negative toggle defaults to true and the Exact field is blank
    // until the user types — fill it explicitly to mirror what a real
    // user would do.
    await page.getByRole("radio", { name: "Exact" }).click();
    await page.getByRole("textbox", { name: "Exact amount" }).fill("39");

    await page.getByRole("button", { name: /^Label/ }).click();

    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await page.getByRole("tab", { name: "Patterns" }).click();

    // The chip text is locale-aware via formatAmount but the digits
    // and "Exactly" / "-" markers come through unchanged.
    await expect(page.getByText(/Exactly.*-?\s*39/).first()).toBeVisible();
    // No bare "Negative" chip when bounds are present — the chip
    // already carries the sign.
    await expect(page.getByText("Negative")).toHaveCount(0);
  });

  test("Move down swaps adjacent rules in the Patterns list", async ({
    page,
  }) => {
    await signInAsGuest(page);

    // Two rules off two rows so the cards have visibly different
    // patterns to assert against. Wait for each modal to dismiss
    // before opening the next — the portal backdrop intercepts
    // clicks while the modal animates out.
    await addRow(page, "APPLE.COM/BILL", "39");
    await openRowMenu(page, "APPLE.COM/BILL");
    await page.getByRole("menuitem", { name: "Label similar" }).click();
    await page.getByRole("button", { name: /^Label/ }).click();
    await expect(
      page.getByRole("heading", { name: "Label by pattern" }),
    ).toHaveCount(0);

    await addRow(page, "SPOTIFY", "99");
    await openRowMenu(page, "SPOTIFY");
    await page.getByRole("menuitem", { name: "Label similar" }).click();
    await page.getByRole("button", { name: /^Label/ }).click();
    await expect(
      page.getByRole("heading", { name: "Label by pattern" }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await page.getByRole("tab", { name: "Patterns" }).click();

    // Append order = array order. The APPLE rule was added first so it
    // shows first in the list; SPOTIFY second. Budget-row seeds go
    // through derivePatternFromDescription which normalizes
    // punctuation (`.` and `/` become spaces) so the persisted
    // pattern reads `*APPLE COM BILL*`.
    const cards = page.getByRole("listitem");
    await expect(cards.first()).toContainText("APPLE");
    await expect(cards.nth(1)).toContainText("SPOTIFY");

    // Demote APPLE — the SPOTIFY card should rise to first.
    await page
      .getByRole("button", { name: /Decrease priority of \*APPLE COM BILL\*/ })
      .click();

    await expect(cards.first()).toContainText("SPOTIFY");
    await expect(cards.nth(1)).toContainText("APPLE");

    // Up arrow on the now-first card is disabled at the top of the
    // list — confirms the reducer no-ops at the boundary instead of
    // wrapping around.
    await expect(
      page.getByRole("button", { name: /Increase priority of \*SPOTIFY\*/ }),
    ).toBeDisabled();
  });
});
