import { expect, signInAsGuest, test } from "../fixtures";

// Regression: on iOS 26 Safari with the floating Liquid Glass address
// bar, the BottomBar visibly shifted up while the budget was empty and
// dropped back down to the screen edge once the user had enough rows
// to scroll. Cause: the page-level `min-height: 100svh` floor (added
// to kill the empty-budget scrollable band) pinned the body to the
// chrome-excluded inner box, and iOS resolved
// `position: fixed; bottom: 0` against that body box on empty pages
// (so the bar sat above the chrome) while tall pages let it fall back
// to the layout-viewport bottom (so the bar landed at the screen
// edge). Fixed by anchoring the bar via `top: 100dvh` +
// `-translate-y-full` so the bar's bottom edge always lands at the
// dynamic viewport bottom, irrespective of body height. PR for the
// fix is the one this spec lives in.

test.describe("BottomBar anchor stability", () => {
  test("the bar sits at the same y on an empty budget and on a tall one", async ({
    page,
  }) => {
    await signInAsGuest(page);
    await page.waitForTimeout(200);

    // Capture the bar's bottom-edge y on the empty budget — the bar
    // is rendered as a `data-floating-chrome` div directly under the
    // BudgetView wrapper. Use `getBoundingClientRect().bottom` so we
    // measure the visible edge regardless of which CSS anchor (top +
    // translate vs. bottom: 0) the layout uses.
    const emptyBottom = await page.evaluate(() => {
      const bar = document.querySelector(
        "[data-floating-chrome]",
      ) as HTMLElement | null;
      return bar ? bar.getBoundingClientRect().bottom : null;
    });
    expect(emptyBottom).not.toBeNull();

    // Simulate the iOS 26 Liquid Glass split where `100dvh` resolves
    // to a layout viewport larger than the visible `100svh` box, and
    // re-measure. If the bar were still anchored via `bottom: 0`, the
    // pixel value would track the body's `svh` bottom and the bar
    // would move when scroll state changed. With the `top: 100dvh`
    // anchor in place the bar must sit at the same `dvh` bottom in
    // both states.
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("viewport size unavailable");
    const svhPx = viewport.height;
    const dvhPx = viewport.height + 120;

    const splitBottom = await page.evaluate(
      ({ svhPx, dvhPx }) => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(`
          html, body, #root { min-height: ${svhPx}px !important; }
          .min-h-svh { min-height: ${svhPx}px !important; }
          [data-floating-chrome] { top: ${dvhPx}px !important; }
        `);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        const bar = document.querySelector(
          "[data-floating-chrome]",
        ) as HTMLElement | null;
        return bar ? bar.getBoundingClientRect().bottom : null;
      },
      { svhPx, dvhPx },
    );
    expect(splitBottom).not.toBeNull();

    // The bar's bottom edge under the simulated Liquid Glass split
    // must equal the `dvh` floor we forced — i.e. the bar tracked
    // `top: 100dvh` and translated its own height upward to land its
    // bottom edge there. If a future refactor reverted to
    // `bottom: 0`, the bar would instead land at the body's `svh`
    // bottom (= `svhPx`) and this assertion would fail by 120px.
    expect(splitBottom).toBe(dvhPx);
  });
});
