import type { Page } from "@playwright/test";

import { expect, signInAsGuest, test } from "../fixtures";

// Regression: picking a far-future entry from the transaction search
// modal failed to scroll to it. Reported against a recurring salary
// ("Lön") whose future occurrences sit well past the rendered window —
// clicking one in the search results left the user stranded (in the
// report, on a stale month) instead of jumping to the picked row.
//
// The cause: `useScrollToRowRequest` grew `extraHistory` to reveal a
// target older than the default history window, but had no symmetric
// path for a target *past* the future cutoff. With the default
// `showFutureEntries: false` the cutoff is the current month, so every
// future-dated pick resolved to a month that `visibleMonths` filtered
// out — the `[data-row-id]` query then found nothing and the
// scroll-into-view silently no-oped.
//
// The fix grows `extraFuture` by the gap between the cutoff and the
// target before scrolling, mirroring the history path. This spec adds
// a row dated two years out (hidden by default), searches for it,
// picks it, and asserts the row renders and pulses.

test.describe("Search jump to a future row", () => {
  async function addRow(page: Page, description: string, amount: string) {
    await page.keyboard.press("Escape");
    await page.mouse.click(10, 200);
    await page
      .getByRole("button", { name: /^Add row/ })
      .first()
      .click();
    const lastRow = page.locator("tbody tr").last();
    await lastRow.getByRole("button", { name: "Add description" }).click();
    await page.getByPlaceholder("Description").fill(description);
    await page.keyboard.press("Escape");
    await lastRow.locator("input[inputmode='decimal']").first().fill(amount);
    await page.keyboard.press("Tab");
  }

  test("picking a far-future entry reveals and pulses the row", async ({
    page,
  }) => {
    await signInAsGuest(page);
    await addRow(page, "Future salary", "50000");

    // Push the row two years into the future via its date cell so it
    // lands well past the default (current-month) future cutoff.
    const futureYear = new Date().getFullYear() + 2;
    const targetIso = `${futureYear}-06-25`;

    const lastRow = page.locator("tbody tr").last();
    await lastRow.getByRole("button", { name: /^Change date/ }).click();
    await page.getByRole("combobox", { name: "Month" }).click();
    await page.getByRole("option", { name: "June", exact: true }).click();
    await page.getByRole("combobox", { name: "Year" }).click();
    await page
      .getByRole("option", { name: String(futureYear), exact: true })
      .click();
    await page.getByRole("button", { name: targetIso, exact: true }).click();

    // With future entries hidden by default, the row drops out of the
    // rendered window — the precondition the bug needs.
    await expect(
      page.getByRole("button", { name: /^Open Future salary/i }),
    ).toHaveCount(0);

    await page.getByRole("button", { name: "Search", exact: true }).click();
    const input = page.getByPlaceholder(
      "Search by description, bank text, company, type, category, or amount",
    );
    await input.fill("Future salary");
    await page.getByRole("button", { name: /^Open Future salary on/i }).click();

    // Modal closes, the future month is revealed, and the picked row
    // pulses — proof it rendered and was scrolled to.
    await expect(
      page.getByRole("heading", { name: "Search", exact: true }),
    ).not.toBeVisible();
    await expect(page.locator("[data-row-pulse]")).toHaveCount(1);
  });
});
