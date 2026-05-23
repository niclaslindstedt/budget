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

  test("standalone PWA disables overscroll-bounce so the sticky bar stays put", async ({
    page,
  }) => {
    // Seven previous iterations all tried to anchor a bottom-pinned
    // toolbar against various viewport flavors on iOS 26 PWAs
    // (JS-translated fixed bar in PRs #357 / #360 / #361 / #362 /
    // #367; `100vh` wrapper with sticky bar in #374; `100dvh`
    // wrapper with sticky bar in #377). Every one left the bar
    // partially clipped on some scroll state, because iOS 26's
    // overscroll-bounce shifts `position: sticky` (and `position:
    // fixed`) anchors during the rubber-band — and on a
    // non-scrolling empty page the user can't drag to undo a bad
    // bounce.
    //
    // The current shape kills the bounce instead of trying to
    // compensate for it:
    //   - `min-height: 100dvh` on the wrapper + page-level floor
    //     (matches the visible viewport on iOS 26 PWAs).
    //   - `overscroll-behavior-y: none` on `html` / `body` /
    //     `[data-budget-shell]` cancels the rubber-band entirely.
    //   - The BottomBar keeps its default `sticky bottom-0` from
    //     the className — with no bounce, it stays at the visible
    //     viewport bottom forever.
    //
    // Playwright doesn't have a first-class display-mode emulator,
    // so this regression asserts the CSS rules *exist* in the
    // stylesheet rather than trying to make the media query match.
    // If a future refactor regresses either piece (the `100dvh`
    // sizing or the overscroll-bounce kill), iOS users feel the bar
    // walking around again.
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
      let shellOverscroll: string | null = null;
      let rootMinHeight: string | null = null;
      let rootOverscroll: string | null = null;
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
            shellOverscroll = r.style.overscrollBehaviorY || shellOverscroll;
          }
          // `html, body, #root` rule — match on `body` since the
          // selector is a comma-separated list.
          if (/(^|,)\s*body\s*(,|$)/.test(r.selectorText)) {
            rootMinHeight = r.style.minHeight || rootMinHeight;
            rootOverscroll = r.style.overscrollBehaviorY || rootOverscroll;
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
      return {
        shellMinHeight,
        shellOverscroll,
        rootMinHeight,
        rootOverscroll,
        chromeOverride,
      };
    });

    // The wrapper and page floor MUST use `100dvh` — the unit that
    // matches the visible viewport in iOS 26 standalone.
    expect(rules.shellMinHeight).toBe("100dvh");
    expect(rules.rootMinHeight).toBe("100dvh");
    // `overscroll-behavior-y: none` MUST be set on the wrapper AND
    // the page-level scroll surfaces — without it the iOS 26
    // rubber-band shifts the sticky bar off the bottom of an
    // empty (non-scrolling) page and the user has no way to drag
    // it back.
    expect(rules.shellOverscroll).toBe("none");
    expect(rules.rootOverscroll).toBe("none");
    // The bar MUST NOT be re-positioned in standalone mode — the
    // default `sticky bottom-0` from the className is what lands
    // it at the wrapper's bottom edge AND keeps it there on an
    // empty, non-scrolling page.
    expect(rules.chromeOverride).toBeNull();
  });
});
