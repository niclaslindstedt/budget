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

  test("standalone PWA promotes the bar to fixed + reserves main padding", async ({
    page,
  }) => {
    // Nine previous iterations (#357 / #360 / #361 / #362 / #367 /
    // #374 / #377 / #380 / #383) all tried to anchor the BottomBar
    // by sizing the WRAPPER and letting `position: sticky; bottom: 0`
    // inherit the size. Each one missed a corner case on iOS 26
    // PWAs (cold-launch shift, scroll-walk, overscroll-bounce,
    // dvh undershoot, vh overshoot, calc overshoot).
    //
    // The current shape borrows the Modal component's fullscreen
    // footer pattern: `position: fixed; inset: auto 0 0 0` for the
    // bar, plus a reserve `padding-bottom` on `<main>` so the AddRow
    // clears it. Fixed positioning anchors to the layout viewport's
    // bottom edge (the actual screen bottom in PWA mode), and the
    // bar's inner `pb-[…safe-area-inset-bottom…]` lifts the icons
    // above the home indicator. The wrapper goes back to a clean
    // `min-height: 100dvh` so the page doesn't become scrollable
    // on an empty budget.
    //
    // Playwright doesn't have a first-class display-mode emulator,
    // so this regression asserts the CSS rules *exist* in the
    // stylesheet rather than trying to make the media query match.
    // If a future refactor drops any of the three contract pieces
    // (wrapper at `100dvh`, bar at `fixed` anchored to `auto 0 0 0`,
    // main padding referencing `env(safe-area-inset-bottom)`), iOS
    // users feel the bar walking again.
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
      let shellMinHeight: string | null = null;
      let rootMinHeight: string | null = null;
      let chromePosition: string | null = null;
      let chromeInset: string | null = null;
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
          if (r.selectorText.includes("[data-budget-shell]")) {
            shellMinHeight = r.style.minHeight || shellMinHeight;
          }
          // `html, body, #root` rule — match on `body` since the
          // selector is a comma-separated list.
          if (/(^|,)\s*body\s*(,|$)/.test(r.selectorText)) {
            rootMinHeight = r.style.minHeight || rootMinHeight;
          }
          if (r.selectorText.includes("[data-floating-chrome]")) {
            chromePosition = r.style.position || chromePosition;
            chromeInset = r.style.inset || chromeInset;
          }
          if (r.selectorText.includes("[data-budget-main]")) {
            mainPaddingBottom = r.style.paddingBottom || mainPaddingBottom;
          }
        }
      }
      return {
        shellMinHeight,
        rootMinHeight,
        chromePosition,
        chromeInset,
        mainPaddingBottom,
      };
    });

    // Wrapper sized to the visible viewport so an empty budget
    // doesn't become scrollable. `100dvh` is what every browser
    // gets right; iOS 26 PWA's shortfall is invisible here because
    // the bar isn't sized against the wrapper anymore.
    expect(rules.shellMinHeight).toBe("100dvh");
    expect(rules.rootMinHeight).toBe("100dvh");
    // The bar MUST be `position: fixed` and anchored bottom-0 via
    // the `inset: auto 0 0 0` shorthand — the same Modal footer
    // pattern that already works for the fullscreen modal variant.
    expect(rules.chromePosition).toBe("fixed");
    // Browser may normalize `inset: auto 0 0 0` to `auto 0px 0px`
    // (collapsing the trailing repeat). Match either form.
    expect(rules.chromeInset).toMatch(/\bauto\s+0(?:px)?\s+0(?:px)?/);
    // Main must reserve room for the now out-of-flow fixed bar,
    // and the reserve must include the home-indicator inset.
    expect(rules.mainPaddingBottom).toContain("env(safe-area-inset-bottom)");
  });
});
