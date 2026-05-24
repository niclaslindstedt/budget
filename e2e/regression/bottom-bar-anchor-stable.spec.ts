import { expect, signInAsGuest, test } from "../fixtures";

// Regression suite for the BottomBar's two positioning modes:
//
//   - Browser mode (Safari / Chrome / Firefox tab): `position:
//     sticky; bottom: 0` inside a `min-h-svh` flex column, with
//     `translate-y-[calc(100dvh-100svh)]` compensating for iOS 26
//     Safari's floating Liquid Glass address bar (PR #354). The
//     first two tests below lock this in: the bar must stay
//     `sticky`, the empty page must not become scrollable, and
//     the bar's bottom edge must land at or above the svh floor
//     even when dvh > svh.
//
//   - Installed PWA mode (`@media (display-mode: standalone)` in
//     `src/styles.css`): bar promoted to `position: fixed; inset:
//     auto 0 0 0`, wrapper at `min-height: 100dvh`, main padded
//     to clear the out-of-flow bar (PR #386). The third test
//     locks the standalone CSS contract.
//
// iOS 26 PWAs ship a cold-launch quirk (WebKit #297779) where
// `position: fixed; bottom: 0` anchors to a clipped
// `visualViewport.bottom` until the first overscroll-bounce
// reconciles it. The intentionally-uncompensated symptom is the
// bar sitting ~20–30 px above the screen edge on cold launch.
// PRs #357 / #360 / #361 / #362 / #367 / #374 / #377 / #380 /
// #383 / #388 all tried to fix that from CSS or JS; each
// introduced its own regression (page scrolls, bar walks during
// drag, smooth-scroll feel killed). The current shape accepts
// the cold-launch shift as an iOS bug and tracks no compensation
// — see the long comment above the standalone block in
// `styles.css` for the full reasoning.

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
    // Standalone-mode contract: wrapper at `min-height: 100dvh`,
    // bar at `position: fixed; inset: auto 0 0 0` (same pattern as
    // the Modal's fullscreen footer), main given a `padding-bottom`
    // reserve so the AddRow clears the out-of-flow bar.
    //
    // Playwright doesn't have a first-class display-mode emulator,
    // so this test asserts the CSS rules *exist* in the stylesheet
    // rather than trying to make the media query match. If a future
    // refactor drops any of the three contract pieces, iOS PWA
    // users feel the bar misbehaving again.
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
          // PR #391 scoped the bottom-anchoring half of the standalone
          // rule from `[data-floating-chrome]` (which also matched the
          // floating Today pill and was dragging it underneath the bar)
          // to a dedicated `[data-bottom-bar]` marker on the bar itself.
          // The shared `[data-floating-chrome]` selector still carries
          // the `--bar-offset` translate so the pill keeps a constant
          // gap above the bar, but `position: fixed; inset: auto 0 0 0`
          // now lives under `[data-bottom-bar]` only.
          if (r.selectorText.includes("[data-bottom-bar]")) {
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
