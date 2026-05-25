import { expect, signInAsGuest, test } from "../fixtures";

// Regression: in landscape PWA mode (phones held sideways at e.g.
// 844 × 390), the sheet's date and type column cells rendered their
// desktop variants — short-date "DD/MM" and the full-text type chip —
// inside the mobile-narrow 40px grid tracks, so content overflowed the
// column boundary and the row looked cramped. The grid layout flipped
// to mobile correctly via `@media (max-height: 500px)` in styles.css
// at line 580, but the cell content's `md:hidden` / `hidden md:inline`
// Tailwind utilities only check width — at width > 720, height ≤ 500
// they kept showing the desktop variants. Fixed by mirroring the
// grid's height-based media query for the cell-content visibility too
// (same pattern the column-header label already used at line 776).

test.describe("Sheet cells in landscape", () => {
  // 844 × 390 mimics an iPhone 12+ held sideways: width > 720 (so
  // Tailwind's md:* would naively kick in) but height ≤ 500 (so the
  // grid layout flips to mobile-narrow tracks).
  test.use({ viewport: { width: 844, height: 390 } });

  test("date and type cells use mobile variants when the grid does", async ({
    page,
  }) => {
    await signInAsGuest(page);

    // Seed a row with a type so the type cell renders a chip rather
    // than the dashed "Add type" placeholder.
    await page
      .getByRole("button", { name: /^Add row/ })
      .first()
      .click();
    const newRow = page.locator("tbody").first().locator("tr").last();
    await newRow.getByRole("button", { name: "Add type" }).click();
    await page.getByRole("option", { name: /Housing/ }).click();
    await page.getByRole("option", { name: /^Rent$/ }).click();

    // Date cell: the short-date span (`hidden md:inline`) should stay
    // hidden in landscape; the day-only span (`md:hidden`) is what the
    // user reads. We can't grep by class, so check the rendered text
    // strips the "/" separator — short-date format is "D/M" or "DD/MM".
    const dateCellText = await newRow.locator("td").first().innerText();
    expect(dateCellText).not.toMatch(/\//);

    // Type cell: in landscape the chip's text label is hidden and only
    // the coloured glyph remains, so the rendered text in the cell is
    // empty. The TypePickerCell is the third <td> (after date and
    // description). Without the fix, the chip's "Rent" label would
    // overflow the 40px-floored type column; with the fix only the
    // home glyph remains.
    const typeCell = newRow.locator("td").nth(2);
    const typeText = await typeCell.innerText();
    expect(typeText.trim()).toBe("");
  });
});
