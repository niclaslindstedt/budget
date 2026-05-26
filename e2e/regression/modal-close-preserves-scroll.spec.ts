import { expect, signInAsGuest, test } from "../fixtures";

// Regression: editing a budget row on iOS while scrolled away from
// the top would snap the page back to scrollY=0 the instant the user
// pressed Save. Reported against an iOS PWA: tap pencil on a historic
// budget item, edit, Save → the page jumps to the top of the sheet,
// so the next item you wanted to edit is now off-screen.
//
// The cause is iOS Safari's handling of `body.overflow = "hidden"`,
// which `useBodyScrollLock` uses to freeze the page underneath the
// modal. iOS resets the document scroll to 0 the moment the body is
// no longer scrollable, hidden by the fullscreen modal so the user
// only sees the snap-to-top after Save closes the modal. Chrome and
// Firefox preserve scrollY across the toggle, so the bug surfaces
// only on iOS.
//
// The fix snapshots `window.scrollY` in `acquire()` and restores it
// in `release()` if anything changed in between — the no-op case on
// Chrome stays untouched, the iOS case lands back where the modal
// opened from. Playwright drives Chromium, so the spec simulates the
// iOS reset by scrolling the document to 0 while the modal is open;
// a healthy `release()` restores the snapshot regardless of what
// changed scrollY underneath it.

test.describe("Modal close preserves scroll position", () => {
  test("scroll snapshot survives a reset while the modal is open", async ({
    page,
  }) => {
    await signInAsGuest(page);

    // Pad the current month with enough rows that the page is
    // scrollable past the viewport. ~30 rows × ~40px clears a typical
    // 800px viewport with margin to spare on every CI runner.
    const addRow = page.getByRole("button", { name: /^Add row/ }).first();
    for (let i = 0; i < 30; i++) {
      await addRow.click();
    }
    // Dismiss any cell-level active state left over from the last add
    // (the freshly minted row's description cell often holds focus and
    // surfaces a DismissBackdrop that would intercept the pencil click
    // below). Escape collapses the active editor; a tap on a neutral
    // spot then settles the active-row coordinator.
    await page.keyboard.press("Escape");
    await page.locator("body").click({ position: { x: 5, y: 5 } });

    // Pick a pencil somewhere in the middle of the list so that
    // scrolling that row into view leaves real distance between the
    // page top and the viewport. The bug would snap to 0 from any
    // non-zero scrollY.
    const pencils = page.getByRole("button", { name: "Edit row" });
    const targetPencil = pencils.nth(15);
    await targetPencil.scrollIntoViewIfNeeded();
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(scrollBefore).toBeGreaterThan(100);

    await targetPencil.click();
    await expect(page.getByRole("dialog")).toBeVisible();

    // Simulate iOS Safari's body-overflow scroll reset by yanking
    // the document scrollY to 0 while the modal is open. Chrome
    // doesn't do this on its own — `useBodyScrollLock` saw the
    // pre-modal scrollY at acquire time, so a healthy `release()`
    // restores it regardless of what happened in between.
    const scrollDuring = await page.evaluate(() => {
      // body.overflow=hidden is in effect; force scroll by also
      // releasing it temporarily, then re-applying.
      const prev = document.body.style.overflow;
      document.body.style.overflow = "";
      window.scrollTo({ top: 0, behavior: "auto" });
      document.body.style.overflow = prev;
      return window.scrollY;
    });
    expect(scrollDuring).toBe(0);

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(page.getByRole("dialog")).not.toBeVisible();

    const scrollAfter = await page.evaluate(() => window.scrollY);
    // The bug stays at 0; a healthy fix lands back within a few
    // pixels of the original position. The tolerance covers
    // sub-pixel rounding and any dispatch-triggered layout shift.
    expect(Math.abs(scrollAfter - scrollBefore)).toBeLessThan(10);
  });
});
