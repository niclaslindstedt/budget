import { expect, signInAsGuest, test } from "../fixtures";

// The header star now opens an in-tree modal showing the full
// achievement catalog (the standalone `/achievements` page was
// retired in favour of a fullscreen modal). This spec drives the
// happy path: guest sign-in unlocks `localHero` via the bus, the
// outline star opens the modal, and the catalog renders with at
// least one unlocked entry plus the locked rows.

test.describe("Achievements modal", () => {
  test("opens from the empty star and reflects an unlocked entry", async ({
    page,
  }) => {
    await signInAsGuest(page);
    // localHero unlocks during sign-in, so the star starts filled
    // with "1 new achievement" — click it, dismiss the unlock toast,
    // then click the now-outline star to land on the catalog modal.
    await page.waitForTimeout(500);
    await page
      .getByRole("button", { name: /new achievement/i })
      .first()
      .click();
    await page.getByRole("button", { name: "Awesome!" }).click();

    await page
      .getByRole("button", { name: "Achievements", exact: true })
      .first()
      .click();

    // Header announces itself via the labelledBy id.
    await expect(
      page.getByRole("heading", { name: "Achievements" }).first(),
    ).toBeVisible();

    // The four tier headings all render.
    await expect(page.getByRole("heading", { name: "Beginner" })).toBeVisible();
    await expect(
      page.getByRole("heading", { name: "Intermediate" }),
    ).toBeVisible();
    await expect(page.getByRole("heading", { name: "Pro" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Expert" })).toBeVisible();

    // The Local Hero entry, unlocked by guest signin, shows in the
    // Beginner tier with a check rather than the locked padlock.
    const localHero = page.getByText("Local Hero").first();
    await expect(localHero).toBeVisible();

    // Close via the footer button.
    await page
      .getByRole("button", { name: /^Close$/ })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Achievements" }),
    ).not.toBeVisible();
  });

  // The modal pulls every label through `t()` — including the
  // catalog entries. Switching the language flips the tier headings
  // and individual achievement names without a reload.
  test("translates tier headings and achievement names into Swedish", async ({
    page,
  }) => {
    await signInAsGuest(page);
    await page.waitForTimeout(500);

    // Dismiss the unlock toast that opens by default after sign-in.
    await page
      .getByRole("button", { name: /new achievement/i })
      .first()
      .click();
    await page.getByRole("button", { name: "Awesome!" }).click();

    // Swap to Swedish via Settings → General → flag picker → Save.
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await page.getByRole("radio", { name: "Swedish" }).click();
    await page.getByRole("button", { name: "Save", exact: true }).click();

    // Switching the language unlocks `polyglot`, refilling the star.
    // Drain that second unlock toast so the star is back to outline.
    await page.waitForTimeout(300);
    await page
      .getByRole("button", { name: /ny bedrift|nya bedrifter/i })
      .first()
      .click();
    await page.getByRole("button", { name: "Grymt!" }).click();

    // Open the modal — empty-star label is now "Bedrifter".
    await page
      .getByRole("button", { name: "Bedrifter", exact: true })
      .first()
      .click();
    await expect(
      page.getByRole("heading", { name: "Nybörjare" }),
    ).toBeVisible();
    await expect(page.getByText("Lokalhjälte").first()).toBeVisible();
  });
});
