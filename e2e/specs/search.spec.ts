import type { Page } from "@playwright/test";

import { expect, signInAsGuest, test } from "../fixtures";

// Transaction-search modal: the search button sits at the right end
// of the BottomBar and opens a modal that ranks rows across every
// sheet by description / type / category / amount. Picking a result
// switches sheets if needed, scrolls the row into view, and briefly
// pulses it.

test.describe("Transaction search", () => {
  async function addRow(page: Page, description: string, amount: string) {
    await page.keyboard.press("Escape");
    await page.mouse.click(10, 200);
    await page
      .getByRole("button", { name: /^Add row/ })
      .first()
      .click();
    const lastRow = page.locator("tbody tr").last();
    // The description cell now opens its rich popover on every
    // viewport — fill via the portalled textarea, not an inline one.
    await lastRow.getByRole("button", { name: "Add description" }).click();
    await page.getByPlaceholder("Description").fill(description);
    await page.keyboard.press("Escape");
    await lastRow.locator("input[inputmode='decimal']").first().fill(amount);
    await page.keyboard.press("Tab");
  }

  test("search field is focused when the modal opens", async ({ page }) => {
    await signInAsGuest(page);
    await addRow(page, "Rent payment", "100");

    await page.getByRole("button", { name: "Search entries" }).click();
    const input = page.getByPlaceholder(
      "Search by description, bank text, company, type, category, or amount",
    );
    await expect(input).toBeFocused();
  });

  test("description search highlights the match and lists the row", async ({
    page,
  }) => {
    await signInAsGuest(page);
    await addRow(page, "Rent payment", "100");
    await addRow(page, "Groceries Coop", "250");

    await page.getByRole("button", { name: "Search transactions" }).click();
    await expect(
      page.getByRole("heading", { name: "Search transactions" }),
    ).toBeVisible();

    const input = page.getByPlaceholder(
      "Search by description, type, category, or amount",
    );
    await input.fill("Groc");
    await expect(
      page.getByRole("button", { name: /Groceries Coop/i }),
    ).toBeVisible();
    // Highlighted substring renders inside a <mark>.
    await expect(page.locator("mark", { hasText: "Groc" })).toBeVisible();
  });

  test("amount search matches within ±20% on absolute value", async ({
    page,
  }) => {
    await signInAsGuest(page);
    // Default sign on a new row is negative, so 100 is stored as -100.
    // The search compares absolute values so "100" still matches.
    await addRow(page, "Rent payment", "100");
    await addRow(page, "Coffee shop", "45");

    await page.getByRole("button", { name: "Search transactions" }).click();
    const input = page.getByPlaceholder(
      "Search by description, type, category, or amount",
    );
    await input.fill("100");
    await expect(
      page.getByRole("button", { name: /Rent payment/i }),
    ).toBeVisible();
    // 45 is outside the ±20 band around 100, so Coffee shop must not
    // be in the list.
    await expect(
      page.getByRole("button", { name: /Coffee shop/i }),
    ).not.toBeVisible();
  });

  test("clear button empties the input and refocuses", async ({ page }) => {
    await signInAsGuest(page);
    await addRow(page, "Rent payment", "100");

    await page.getByRole("button", { name: "Search transactions" }).click();
    const input = page.getByPlaceholder(
      "Search by description, type, category, or amount",
    );
    await input.fill("Rent");
    await page.getByRole("button", { name: "Clear search" }).click();
    await expect(input).toHaveValue("");
    await expect(input).toBeFocused();
    await expect(
      page.getByText("Start typing to search across every sheet."),
    ).toBeVisible();
  });

  test("query persists across modal close and reopen", async ({ page }) => {
    await signInAsGuest(page);
    await addRow(page, "Groceries Coop", "250");

    await page.getByRole("button", { name: "Search transactions" }).click();
    const input = page.getByPlaceholder(
      "Search by description, type, category, or amount",
    );
    await input.fill("Groc");
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("heading", { name: "Search transactions" }),
    ).not.toBeVisible();
    await page.getByRole("button", { name: "Search transactions" }).click();
    await expect(input).toHaveValue("Groc");
  });

  test("picking a result scrolls to the row and pulses it", async ({
    page,
  }) => {
    await signInAsGuest(page);
    await addRow(page, "Rent payment", "100");
    await addRow(page, "Groceries Coop", "250");
    await addRow(page, "Coffee shop", "45");

    await page.getByRole("button", { name: "Search transactions" }).click();
    const input = page.getByPlaceholder(
      "Search by description, type, category, or amount",
    );
    await input.fill("Coffee");
    await page.getByRole("button", { name: /Coffee shop/i }).click();

    // Modal closes.
    await expect(
      page.getByRole("heading", { name: "Search transactions" }),
    ).not.toBeVisible();
    // Pulse attribute lands on exactly one row mid-animation.
    await expect(page.locator("[data-row-pulse]")).toHaveCount(1);
    // And clears after ~1700ms.
    await expect(page.locator("[data-row-pulse]")).toHaveCount(0, {
      timeout: 3000,
    });
  });
});
