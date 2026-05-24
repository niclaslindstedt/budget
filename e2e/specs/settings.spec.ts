import { expect, signInAsGuest, test } from "../fixtures";

// Settings-modal flow. The burger menu in the header is the only path
// into Settings, and the modal is where every cross-cutting preference
// (language, appearance, storage) lives. These specs drive the most
// common reasons a user opens Settings: opening, switching language,
// and closing the modal again.

test.describe("Settings modal", () => {
  test("opens from the header menu", async ({ page }) => {
    await signInAsGuest(page);

    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();

    await expect(
      page.getByRole("heading", { name: "Settings", exact: true }),
    ).toBeVisible();
  });

  test("closes via the Close button", async ({ page }) => {
    await signInAsGuest(page);

    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();

    const settingsHeading = page.getByRole("heading", {
      name: "Settings",
      exact: true,
    });
    await expect(settingsHeading).toBeVisible();

    await page
      .getByRole("button", { name: "Close", exact: true })
      .first()
      .click();
    await expect(settingsHeading).not.toBeVisible();
  });

  test("Appearance previews the theme live and reverts on cancel", async ({
    page,
  }) => {
    await signInAsGuest(page);

    // Guest sessions boot into the default System theme — confirm
    // before we start poking the picker so the preview / revert
    // assertions are anchored to a known starting point.
    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "system");

    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await page.getByRole("tab", { name: "Appearance" }).click();

    // Selecting Light should apply the family default (One Light) to
    // <html> immediately, while Save is still untouched — the modal
    // pushes the draft up so the user can see their pick.
    await page.getByRole("radio", { name: "Light" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");

    // Cancel clears the live preview; the persisted System theme
    // reasserts without the user ever committing the change.
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(html).toHaveAttribute("data-theme", "system");
  });

  test("Appearance saves persist the previewed theme", async ({ page }) => {
    await signInAsGuest(page);

    const html = page.locator("html");
    await expect(html).toHaveAttribute("data-theme", "system");

    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await page.getByRole("tab", { name: "Appearance" }).click();

    await page.getByRole("radio", { name: "Light" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");

    await page.getByRole("button", { name: "Save", exact: true }).click();
    await expect(html).toHaveAttribute("data-theme", "light");

    // Reopen to confirm the saved theme is the new starting point —
    // and that reopening doesn't briefly re-apply a stale draft.
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
    await expect(html).toHaveAttribute("data-theme", "light");
  });

  test("switching language to Swedish updates the chrome", async ({ page }) => {
    await signInAsGuest(page);

    // The header burger menu's `aria-label` is the canary string —
    // "Open menu" in English, "Öppna meny" in Swedish.
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();

    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("menuitem", { name: "Settings" }).click();

    // The General tab opens by default and the LanguagePicker sits at
    // the top of it. The picker is a `role="radiogroup"` with two
    // `role="radio"` flag buttons; their accessible name is the
    // language's own name ("English" / "Swedish").
    await page.getByRole("radio", { name: "Swedish" }).click();

    // The picker writes into the modal's draft, not the live settings —
    // the user has to click "Save" before the language change reaches
    // the rest of the app (where it triggers the `budget:language`
    // event and re-renders the catalog).
    await page.getByRole("button", { name: "Save", exact: true }).click();

    await expect(
      page.getByRole("button", { name: "Öppna meny" }),
    ).toBeVisible();
  });
});
