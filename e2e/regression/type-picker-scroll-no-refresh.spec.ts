import { expect, signInAsGuest, test } from "../fixtures";

// Regression: scrolling up inside the TypePicker dropdown on a mobile
// PWA would arm the page-level pull-to-refresh gesture and reload the
// app when the user lifted their finger. The picker is portalled to
// `<body>` via FloatingPanel; its inner `<ul>` carries `overflow-auto`
// for the list of categories / types. `usePullToRefresh` listens at
// the document level and only bailed when an `aria-modal="true"` modal
// was open — it had no awareness of FloatingPanels. So a downward
// finger drag inside the picker (the natural gesture to scroll the list
// upward) was indistinguishable from "pull the page from the top": the
// hook armed at `scrollY=0`, accumulated pull distance through the
// list-scroll touchmove stream, and fired `onRefresh` on lift-off.
// Fixed by also bailing in `onTouchStart` when any `[data-active-portal]`
// is in the DOM — the same marker FloatingPanel and the DismissBackdrop
// already carry for the active-row coordinator.

test.describe("Type picker scroll does not trigger pull-to-refresh", () => {
  test("a downward drag inside the open picker does not fire the PTR indicator", async ({
    page,
  }) => {
    await signInAsGuest(page);

    // Seed a row so the type chip on the empty row reads "Add type".
    await page
      .getByRole("button", { name: /^Add row/ })
      .first()
      .click();
    const lastRow = page.locator("tbody tr").last();
    // Description cell drives both viewports through the portalled
    // `DescriptionPopover`; fill via the trigger + popover textarea.
    await lastRow.getByRole("button", { name: "Add description" }).click();
    await page.getByPlaceholder("Description").fill("Coffee");
    await page.keyboard.press("Escape");

    // Open the type picker via the chip in the type column.
    await lastRow.getByRole("button", { name: "Add type" }).first().click();

    // Sanity: the FloatingPanel is open and carries the marker that
    // the fix keys on.
    const portalCount = await page.evaluate(
      () => document.querySelectorAll("[data-active-portal]").length,
    );
    expect(portalCount).toBeGreaterThan(0);

    // Synthesise a downward touch drag that begins inside the picker's
    // listbox. Chromium supports `Touch` / `TouchEvent` constructors
    // even without `hasTouch`, so we can drive `usePullToRefresh`'s
    // document-level listeners directly without flipping the project
    // into a touch context.
    await page.evaluate(() => {
      const target = document.querySelector(
        "[data-active-portal] [role='option']",
      ) as HTMLElement | null;
      if (!target) throw new Error("listbox option not found");
      const fire = (type: string, clientY: number, end = false) => {
        const touch = new Touch({
          identifier: 1,
          target,
          clientX: 200,
          clientY,
        });
        const ev = new TouchEvent(type, {
          bubbles: true,
          cancelable: true,
          touches: end ? [] : [touch],
          targetTouches: end ? [] : [touch],
          changedTouches: [touch],
        });
        // Touch events on `document` are what `usePullToRefresh`
        // listens for; the synthetic event bubbles from `target`.
        target.dispatchEvent(ev);
      };
      // Start at y=200, drag down past `TRIGGER_DISTANCE / RESISTANCE`
      // (70 / 0.5 = 140px raw) so a non-bailing PTR would land in the
      // "release" state — proves the fix isn't merely staying in
      // "pulling" by accident.
      fire("touchstart", 200);
      fire("touchmove", 250);
      fire("touchmove", 320);
      fire("touchmove", 400);
      fire("touchend", 400, true);
    });

    // The indicator renders a `role="status"` band when the PTR state
    // leaves `idle`. If the fix held, the band never mounted; if it
    // didn't, the band shows "Refreshing…" / "Release to refresh" /
    // "Pull to refresh".
    const indicator = page.getByRole("status").filter({
      hasText: /(Pull to refresh|Release to refresh|Refreshing)/,
    });
    await expect(indicator).toHaveCount(0);

    // The picker itself is still open — the gesture neither dismissed
    // it nor reloaded the page out from under it.
    expect(
      await page.evaluate(
        () => document.querySelectorAll("[data-active-portal]").length,
      ),
    ).toBeGreaterThan(0);
  });
});
