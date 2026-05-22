import { expect, signInAsGuest, test } from "../fixtures";

// Regression: any data mutation used to kick the autosave hook into an
// endless save loop. `useUserDataStorage`'s save effect kept `status`
// in its dependency list, and `performSave` called
// `setStatus({kind:"saving"})` on every run — each new object reference
// re-ran the effect, cancelled the in-flight save as "stale" via the
// cleanup, and immediately scheduled another one. The cycle never
// settled because every stale completion left status pinned to
// "saving", which the next loop iteration re-set to a fresh
// "saving" object. Reported via in-app logs that showed dozens of
// Dropbox saves per second after a sheet switch (a `selectSheet`
// dispatch mutates `data.activeSheetId`, so switching sheets is a
// real data change). Fixed by reading status through a ref so the
// effect's only triggers are adapter / data changes.

test.describe("Save loop", () => {
  test("a single data change settles after a handful of saves", async ({
    page,
  }) => {
    await signInAsGuest(page);

    // Let the initial post-load housekeeping settle so we count writes
    // against the steady state, not the boot sequence.
    await page.waitForTimeout(500);

    // Hook localStorage so we can count saves of the user's budget
    // bucket. The key is `budget.user.<id>` (or
    // `budget.preview.user.<id>` in the preview build) — `.user.` is
    // unique to that bucket and skips the logs / users-registry keys.
    await page.evaluate(() => {
      const w = window as unknown as { __budgetWrites: number };
      w.__budgetWrites = 0;
      const original = Storage.prototype.setItem;
      Storage.prototype.setItem = function (key, value) {
        if (typeof key === "string" && key.includes(".user.")) {
          w.__budgetWrites++;
        }
        return original.call(this, key, value);
      };
    });

    // Trigger a single data change. Adding a row is the simplest path
    // and exercises the same `setData → save effect → performSave`
    // chain the bug report describes.
    await page
      .getByRole("button", { name: /^Add row/ })
      .first()
      .click();

    // Wait through several debounce windows. The local adapter's
    // saveDebounceMs is 0, so a loop would burn through dozens of
    // writes in this period.
    await page.waitForTimeout(1500);

    const writes = await page.evaluate(
      () => (window as unknown as { __budgetWrites: number }).__budgetWrites,
    );

    // One data change settles into at most a handful of writes. The
    // bug produced tens-to-hundreds in the same window.
    expect(writes).toBeLessThan(10);
  });
});
