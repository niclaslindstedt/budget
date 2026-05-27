import { expect, signInAsGuest, test } from "../fixtures";

// Regression: opening the type picker inside Edit recurring row,
// picking a category, then watching the second tier render as an
// empty bordered box with no types, no back button, and no "New
// type" footer — the user saw nothing where the list of types
// belonging to the picked category should have been. Same picker
// inside BudgetEditEntryFullModal in general (not only recurring rows), since
// nothing about the recurring scope fieldset changes the picker.
//
// What was broken: the two-tier picker (TypePicker.tsx) slides
// between CategoryPane and TypePane by translating a `w-[200%]`
// wrapper inside a `relative overflow-hidden` parent. The a11y
// sweep (#403) added `useRovingTabindex` to TypePane, which calls
// `.focus()` on the first item once `itemCount` flips from 0 to N
// after picking a category. The browser's auto-scroll-on-focus
// then scrolled the `overflow-hidden` parent (which is technically
// a scroll container — `overflow: hidden` still allows programmatic
// scroll) to bring the focused item into view, compounding with the
// CSS translateX and shifting the wrapper an extra panel-width to
// the left. Visible region of the panel ended up showing the gap
// to the right of the TypePane (no content). Fixed by switching
// the parent to `overflow: clip`, which clips visually without
// creating a scroll container, so the focus auto-scroll has no
// effect.

test.describe("Type picker renders types after picking a category", () => {
  test("BudgetEditEntryFullModal type picker shows the types in the picked category", async ({
    page,
  }) => {
    await signInAsGuest(page);

    // Add a savable row so the long-press / pen flow has something
    // to edit.
    await page
      .getByRole("button", { name: /^Add row/ })
      .first()
      .click();
    const lastRow = page.locator("tbody tr").last();
    await lastRow.locator("textarea").first().fill("Hemkärt AB");
    await page.keyboard.press("Tab");
    const amountInput = lastRow.locator("input[inputmode='decimal']").first();
    await amountInput.fill("3600");
    await amountInput.blur();

    // Open the pen-icon BudgetEditEntryFullModal directly (the bug repros on any
    // row, recurring or not — the picker's tier-flip path is the
    // same).
    await lastRow.hover();
    await page.getByRole("button", { name: "Edit row" }).first().click();

    const modal = page.getByRole("dialog");
    await expect(modal).toBeVisible();

    // Open the type picker.
    await modal.getByRole("button", { name: /^Pick a type/ }).click();

    // First tier (categories) should render with at least one option —
    // the preset list has Bills / Food / Housing / etc.
    const billsOption = page.getByRole("option", { name: /Bills/ });
    await expect(billsOption).toBeVisible();

    // Pick a category. After the tier flip, the second tier should
    // render the types belonging to "Bills" — the pre-fix bug left
    // the panel empty, so a known type label is the truth signal.
    await billsOption.click();

    // Phone is a built-in type under the Bills category (see
    // src/data/constants.ts). Any of the built-in Bills types would
    // do; Phone has been there since the preset rework. The pre-fix
    // bug left the Phone option in the DOM but shifted the entire
    // tier wrapper off-screen via a scrollLeft compounded with
    // translateX, so `toBeVisible` alone passed because the element
    // technically had a non-zero bounding box. Compare the option's
    // x-position against the trigger button's x-position to catch
    // the off-screen case — the trigger is anchored to the modal
    // body and not affected by the wrapper's transform.
    const phoneOption = page.getByRole("option", { name: /Phone/ });
    await expect(phoneOption).toBeVisible();
    // Picker animates its tier transition over 200ms — wait past the
    // animation so the bounding box reflects the final position.
    await page.waitForTimeout(300);
    const trigger = modal.getByRole("button", { name: /^Pick a type/ });
    const triggerBox = await trigger.boundingBox();
    const optionBox = await phoneOption.boundingBox();
    expect(triggerBox).not.toBeNull();
    expect(optionBox).not.toBeNull();
    // The option must sit roughly under the trigger (same panel
    // column) — the pre-fix bug shifted options to negative x.
    expect(optionBox!.x).toBeGreaterThanOrEqual(triggerBox!.x - 1);
    expect(optionBox!.x + optionBox!.width).toBeLessThanOrEqual(
      triggerBox!.x + triggerBox!.width + 1,
    );
  });
});
