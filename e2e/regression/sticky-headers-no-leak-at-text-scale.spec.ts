import { expect, signInAsGuest, test } from "../fixtures";

// Regression: with the Appearance "Text size" preference below 100%,
// the budget sheet's sticky bands leaked — scrolled rows showed
// through a gap between the app header and the pinned month-name h3,
// and through a second gap between the h3 and the column-header thead.
// The bands' rendered heights are rem-based (they shrink with the
// `--app-font-scale` multiplier on the root font-size), but the sticky
// offsets `--app-header-h` / `--month-header-h` / `--column-header-h`
// were fixed px literals (53 / 24 / 33), so the bands pinned below
// where the shrunken chrome actually ended. Fixed by expressing the
// offset variables in rem (plus the fixed icon px and border term) so
// they track the bands' real heights at any text scale.

test.describe("Sticky header stack at reduced text scale", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("month header and thead pin flush below the bands above them", async ({
    page,
  }) => {
    await signInAsGuest(page);

    // Apply the same projection `useAppearanceProjection` performs
    // when the user drops Text size to 85%.
    await page.evaluate(() =>
      document.documentElement.style.setProperty("--app-font-scale", "0.85"),
    );

    const bands = await page.evaluate(() => {
      const header = document.querySelector<HTMLElement>("[data-app-header]");
      const h3 = document.querySelector<HTMLElement>("section > h3");
      const thead = document.querySelector<HTMLElement>(
        ".budget-table > thead",
      );
      if (!header || !h3 || !thead) return null;
      return {
        headerHeight: header.getBoundingClientRect().height,
        monthHeight: h3.getBoundingClientRect().height,
        // Computed `top` resolves the calc()/var() sticky offset to px.
        h3Top: parseFloat(getComputedStyle(h3).top),
        theadTop: parseFloat(getComputedStyle(thead).top),
      };
    });

    expect(bands).not.toBeNull();
    const { headerHeight, monthHeight, h3Top, theadTop } = bands!;

    // The month h3 must pin exactly at the app header's bottom edge —
    // any daylight between the two is where scrolled rows leak.
    expect(Math.abs(h3Top - headerHeight)).toBeLessThanOrEqual(1);

    // The thead pins at header + month band − 1px (the deliberate
    // hairline overlap). Before the fix this sat ~3px below the h3's
    // real bottom at 85% scale (and further below at smaller scales).
    expect(
      Math.abs(theadTop - (headerHeight + monthHeight - 1)),
    ).toBeLessThanOrEqual(1);
  });
});
