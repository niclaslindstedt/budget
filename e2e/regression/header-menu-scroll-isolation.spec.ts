import { expect, signInAsGuest, test } from "../fixtures";

// Regression: opening the burger menu and touch-dragging on it would
// scroll the page underneath on mobile. The menu's `overflow-y-auto`
// container never reached its own scroll boundary (the short item list
// always fit), so the touch chained to the body. The fix locks body
// scroll while any FloatingPanel (the dropdown shell shared by every
// portalled picker / menu / popover) is open, matching how Modal
// already behaved. PR for the fix is the one this spec lives in.

test.describe("Header menu scroll isolation", () => {
  test("opening the burger menu locks body scroll", async ({ page }) => {
    await signInAsGuest(page);

    // Sanity check: before the menu opens, body scroll is unlocked.
    const overflowBefore = await page.evaluate(
      () => document.body.style.overflow,
    );
    expect(overflowBefore).not.toBe("hidden");

    await page.getByRole("button", { name: "Open menu" }).click();
    await expect(
      page.getByRole("menuitem", { name: "Settings" }),
    ).toBeVisible();

    const overflowOpen = await page.evaluate(
      () => document.body.style.overflow,
    );
    expect(overflowOpen).toBe("hidden");

    // Closing the menu releases the lock so the page scrolls again.
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("menuitem", { name: "Settings" }),
    ).not.toBeVisible();

    const overflowAfter = await page.evaluate(
      () => document.body.style.overflow,
    );
    expect(overflowAfter).not.toBe("hidden");
  });
});
