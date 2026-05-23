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

  test("standalone PWA uses 100dvh on the wrapper so sticky bottom lands at the screen edge", async ({
    page,
  }) => {
    // iOS 26 ships a viewport-coherence regression (WebKit #297779
    // / #301994). Five JS-driven workarounds (PRs #357 / #360 /
    // #361 / #362 / #367) all failed for various reasons, and PR
    // #374 then switched the standalone-mode wrapper to
    // `min-height: 100vh` based on third-party reports that `vh`
    // was the only correct unit on iOS 26 cold launch. The user
    // reported that change overshot the visible viewport — `100vh`
    // includes the home-indicator gesture area, so the page became
    // scrollable on an empty budget and the sticky bar slipped
    // below the visible bottom during overscroll.
    //
    // The current shape uses `100dvh` instead. In a PWA window
    // there is no dynamic chrome to make `dvh` jitter (so the
    // "value walks during scroll" objection from the browser-mode
    // discussion in PR #348 doesn't apply), and unlike `100vh`
    // it matches the visible viewport, so the wrapper fits
    // exactly. The BottomBar keeps its default `sticky bottom-0`
    // from the className — no override needed. Sticky inside a
    // correctly-sized parent lands at the parent's bottom edge,
    // which IS the screen edge.
    //
    // Playwright doesn't have a first-class display-mode emulator,
    // so this regression asserts the CSS rules *exist* in the
    // stylesheet rather than trying to make the media query match.
    // If a future refactor reintroduces `100vh` / `100svh` on the
    // wrapper, or moves the bar back to `position: fixed` /
    // `transform`-driven positioning, the test fails before iOS
    // users feel it again.
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
      let chromeOverride: {
        position: string;
        transform: string;
        inset: string;
      } | null = null;
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
            chromeOverride = {
              position: r.style.position,
              transform: r.style.transform,
              inset: r.style.inset,
            };
          }
        }
      }
      return { shellMinHeight, rootMinHeight, chromeOverride };
    });

    // The wrapper and page floor MUST use `100dvh` — the unit that
    // matches the visible viewport in iOS 26 standalone. `100vh`
    // overshoots (includes the home-indicator strip), making the
    // page scrollable on empty budgets; `100svh` undershoots on
    // some iOS 26.x patches, leaving the bar floating above the
    // screen edge.
    expect(rules.shellMinHeight).toBe("100dvh");
    expect(rules.rootMinHeight).toBe("100dvh");
    // The bar MUST NOT be re-positioned in standalone mode — the
    // default `sticky bottom-0` from the className is what lands
    // it at the screen edge AND keeps it there on an empty,
    // non-scrolling page (where the user would otherwise have no
    // way to drag the bar back into view).
    expect(rules.chromeOverride).toBeNull();
  });
});
