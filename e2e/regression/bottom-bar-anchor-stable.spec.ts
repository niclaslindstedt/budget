import { expect, signInAsGuest, test } from "../fixtures";

// Regression: on iOS 26 Safari with the floating Liquid Glass address
// bar, the BottomBar visibly shifted up while the budget was empty
// and dropped back down to the screen edge once the user had enough
// rows to scroll. The first attempt at a fix (#351) re-anchored the
// bar with `position: fixed; top: 100dvh` + `-translate-y-full`, but
// iOS treated the `100dvh` top offset as extending the document's
// scrollable area on Liquid Glass (where `dvh > svh`), so the user
// could pull the page up by the chrome's footprint on an empty
// budget. PR #354 switched the bar to `position: sticky; bottom: 0`
// inside a `min-h-svh` flex column with a `translate-y` compensator,
// which fixed Safari — but iOS 26's `visualViewport` regression
// (WebKit #297779) clips every viewport unit *and* the sticky
// anchor in installed PWAs, so the bar still landed 100–200 px
// above the screen edge on a first-launch empty home-screen install.
//
// The current shape:
//   - Browser mode keeps PR #354's sticky + translate-y trick.
//   - Installed PWA mode (matched via `@media (display-mode:
//     standalone)` in `src/styles.css`) promotes the bar to fixed
//     positioning anchored straight to the visual viewport, drops
//     the transform, and reserves bottom padding on `<main>` so the
//     AddRow button clears the out-of-flow bar.
//
// The first two tests below lock in the browser-mode shape; the
// third locks in the standalone-mode CSS contract. PR for the fix
// is the one this spec lives in.

test.describe("BottomBar anchor stability", () => {
  test("the bar is in flow and does not extend the page past svh", async ({
    page,
  }) => {
    await signInAsGuest(page);
    await page.waitForTimeout(200);

    const dims = await page.evaluate(() => {
      const root = document.documentElement;
      const bar = document.querySelector(
        "[data-floating-chrome]",
      ) as HTMLElement | null;
      return {
        docScroll: root.scrollHeight,
        docClient: root.clientHeight,
        hasScroll: root.scrollHeight > root.clientHeight,
        position: bar ? getComputedStyle(bar).position : null,
      };
    });

    // The bar must use `position: sticky` so it stays in the document
    // flow. A future refactor back to `position: fixed` with an
    // out-of-viewport top offset would reintroduce the iOS 26
    // pull-the-page-up regression.
    expect(dims.position).toBe("sticky");
    // Empty budget must still fit exactly in the visible viewport —
    // no scrollable strip below the AddRow button.
    expect(dims.hasScroll).toBe(false);
    expect(dims.docScroll).toBe(dims.docClient);
  });

  test("the bar lands at the visual viewport floor under a dvh > svh split", async ({
    page,
  }) => {
    await signInAsGuest(page);
    await page.waitForTimeout(200);

    // Chromium reports dvh ≈ svh ≈ lvh so we can't naturally
    // reproduce the iOS 26 split. Simulate it: force the page floor
    // to `svh` (matching the existing `min-h-svh` wrapper) and check
    // the bar's bottom edge lands at that floor, not below. A bar
    // anchored via `fixed; top: 100dvh` would land at `dvh` (off the
    // svh floor) and inflate the document past it.
    const viewport = page.viewportSize();
    if (!viewport) throw new Error("viewport size unavailable");
    const svhPx = viewport.height;
    const dvhPx = viewport.height + 120;

    const result = await page.evaluate(
      ({ svhPx, dvhPx }) => {
        const sheet = new CSSStyleSheet();
        sheet.replaceSync(`
          html, body, #root { min-height: ${svhPx}px !important; }
          .min-h-svh { min-height: ${svhPx}px !important; }
          /* simulate dvh > svh; if any rule still anchored to dvh
             this would surface as the bar landing at dvhPx. */
          :root { --simulated-dvh: ${dvhPx}px; }
        `);
        document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
        const root = document.documentElement;
        const bar = document.querySelector(
          "[data-floating-chrome]",
        ) as HTMLElement | null;
        return {
          docScroll: root.scrollHeight,
          docClient: root.clientHeight,
          hasScroll: root.scrollHeight > root.clientHeight,
          barBottom: bar ? bar.getBoundingClientRect().bottom : null,
        };
      },
      { svhPx, dvhPx },
    );

    // Even under the simulated split, the empty budget cannot scroll
    // and the bar sits at — or above — the svh floor. The page would
    // overflow into the dvh-svh band (and the bar would land at
    // dvhPx) if a future refactor re-anchored the bar via `top: 100dvh`.
    expect(result.hasScroll).toBe(false);
    expect(result.barBottom).not.toBeNull();
    expect(result.barBottom).toBeLessThanOrEqual(svhPx);
  });

  test("standalone PWA promotes the bar to fixed positioning", async ({
    page,
  }) => {
    // iOS 26 ships a `visualViewport` regression (WebKit #297779) that
    // pins viewport units and `bottom: 0` anchors (sticky AND fixed)
    // to an OS-clipped height, leaving the chrome 100–200 px above
    // the physical screen edge in a home-screen-installed PWA — a
    // gap that "snaps shut" the moment the user drags. The fix has
    // two halves:
    //   - `src/styles.css` (`@media (display-mode: standalone)`)
    //     promotes the bar to `position: fixed; inset: auto 0 0 0`
    //     and translates it down by a CSS variable, and reserves
    //     bottom padding on `<main>` so the AddRow clears it.
    //   - `src/hooks/useVisualViewportOffset.ts` measures the gap
    //     between `window.innerHeight` (still correct in iOS 26)
    //     and `visualViewport.height` and writes it to
    //     `--viewport-bottom-offset` on `<html>`.
    //
    // Playwright doesn't have a first-class display-mode emulator,
    // so this regression asserts the CSS rules *exist* in the
    // stylesheet rather than trying to make the media query match.
    // The selector / property values are the contract; if a future
    // refactor drops them the test fails before iOS users feel it.
    await signInAsGuest(page);
    await page.waitForTimeout(200);

    const rules = await page.evaluate(() => {
      const findStandaloneBlock = (
        sheet: CSSStyleSheet,
      ): CSSMediaRule | null => {
        for (const rule of Array.from(sheet.cssRules ?? [])) {
          if (
            rule instanceof CSSMediaRule &&
            /display-mode\s*:\s*standalone/.test(rule.conditionText)
          ) {
            return rule;
          }
        }
        return null;
      };
      let chromePosition: string | null = null;
      let chromeInset: string | null = null;
      let chromeTranslate: string | null = null;
      let mainPaddingBottom: string | null = null;
      for (const sheet of Array.from(document.styleSheets)) {
        let block: CSSMediaRule | null = null;
        try {
          block = findStandaloneBlock(sheet);
        } catch {
          continue;
        }
        if (!block) continue;
        for (const r of Array.from(block.cssRules)) {
          if (!(r instanceof CSSStyleRule)) continue;
          if (r.selectorText.includes("[data-floating-chrome]")) {
            chromePosition = r.style.position || chromePosition;
            chromeInset = r.style.inset || chromeInset;
            chromeTranslate = r.style.translate || chromeTranslate;
          }
          if (r.selectorText.includes("[data-budget-main]")) {
            mainPaddingBottom = r.style.paddingBottom || mainPaddingBottom;
          }
        }
      }
      return {
        chromePosition,
        chromeInset,
        chromeTranslate,
        mainPaddingBottom,
      };
    });

    expect(rules.chromePosition).toBe("fixed");
    expect(rules.chromeInset).toBeTruthy();
    // The translate must reference the JS-maintained
    // `--viewport-bottom-offset` so the bar lands past iOS 26's
    // clipped `visualViewport.bottom` on first paint.
    expect(rules.chromeTranslate).toContain("--viewport-bottom-offset");
    expect(rules.mainPaddingBottom).toContain("env(safe-area-inset-bottom)");
  });
});
