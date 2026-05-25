import { expect, signInAsGuest, test } from "../fixtures";

// Regression: on iOS 26 Safari the floating Liquid Glass address bar
// makes `dvh` resolve to the full layout viewport (including the chrome
// footprint) while `svh` resolves to the chrome-excluded inner box. The
// page-level `min-height: 100dvh` (and the AppShell wrapper's
// `min-h-dvh`) therefore forced the body taller than what the user can
// actually see — for an empty budget that band below the AddRow button
// became a scrollable strip of empty page background. Fixed by switching
// the page-level floor to `100svh` (and the wrapper to `min-h-svh`)
// so an empty budget fits exactly within the visible viewport. Non-empty
// budgets still grow the body to fit their content, so scrolling real
// content behind the translucent chrome keeps working. PR for the fix
// is the one this spec lives in.

test.describe("Empty budget scroll", () => {
  test("a freshly signed-in guest cannot scroll the empty page", async ({
    page,
  }) => {
    await signInAsGuest(page);
    // Wait a frame past the BudgetPage's auto-scroll-to-today rAF so the
    // measurement reflects the settled layout, not the pre-effect one.
    await page.waitForTimeout(200);

    const dims = await page.evaluate(() => {
      const root = document.documentElement;
      const wrapper = document.querySelector(
        "body > #root > div",
      ) as HTMLElement | null;
      return {
        docScroll: root.scrollHeight,
        docClient: root.clientHeight,
        hasScroll: root.scrollHeight > root.clientHeight,
        wrapperMinHeightUnit: wrapper
          ? wrapper.style.minHeight ||
            // Tailwind emits the unit-bearing value into the computed
            // style — capture the raw class so we can also assert it
            // hasn't drifted back to dvh.
            wrapper.className
          : null,
      };
    });

    expect(dims.hasScroll).toBe(false);
    expect(dims.docScroll).toBe(dims.docClient);
    // Lock in the architectural fix: the wrapper must use the `svh`
    // (chrome-excluded) floor, not `dvh`. A future Tailwind refactor
    // that flips back to `min-h-dvh` would reintroduce the iOS 26
    // scrollable-empty-band bug.
    expect(dims.wrapperMinHeightUnit).toContain("min-h-svh");
    expect(dims.wrapperMinHeightUnit).not.toContain("min-h-dvh");
  });

  test("the wrapper sits within the visible viewport when dvh > svh", async ({
    page,
  }) => {
    await signInAsGuest(page);
    await page.waitForTimeout(200);

    // Chromium reports dvh ≈ svh ≈ lvh so we can't naturally reproduce
    // the iOS 26 split. Simulate it: force `min-h-dvh` to resolve to a
    // pixel value larger than the visible viewport, and `min-h-svh`
    // (the new wrapper class) to one that fits. If the wrapper was
    // still using dvh, the body would overflow by the gap; with svh,
    // body still fits.
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("viewport size unavailable");
    const svhPx = viewport.height;
    const dvhPx = viewport.height + 120;

    const result = await page.evaluate(
      ({ dvhPx, svhPx }) => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(`
          html, body, #root { min-height: ${svhPx}px !important; }
          .min-h-dvh { min-height: ${dvhPx}px !important; }
          .min-h-svh { min-height: ${svhPx}px !important; }
        `);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        const root = document.documentElement;
        return {
          docScroll: root.scrollHeight,
          docClient: root.clientHeight,
          hasScroll: root.scrollHeight > root.clientHeight,
        };
      },
      { dvhPx, svhPx },
    );

    expect(result.hasScroll).toBe(false);
    expect(result.docScroll).toBe(svhPx);
  });
});
