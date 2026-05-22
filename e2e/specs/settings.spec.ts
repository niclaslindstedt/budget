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
