import { expect, signInAsGuest, test } from "../fixtures";

// Auth-screen flows. A fresh-install visitor lands on the sign-up form
// because no real accounts exist; the same form exposes the
// "Continue without account" link so the user can start using the app
// without committing to a password. These two specs cover the
// hot-path: pure-guest entry and full account creation.

test.describe("Auth screen", () => {
  test("first visit lands on the sign-up form with a guest option", async ({
    page,
  }) => {
    await page.goto("./");

    await expect(
      page.getByRole("heading", { name: "Welcome — create your account" }),
    ).toBeVisible();

    // The username + password + confirm-password fields define the
    // shape of the sign-up form. We don't fill them here; we only
    // assert they exist so the screen doesn't silently degrade.
    await expect(page.getByLabel("Username", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Password", { exact: true })).toBeVisible();
    await expect(
      page.getByLabel("Confirm password", { exact: true }),
    ).toBeVisible();

    await expect(
      page.getByRole("button", { name: /Continue without account/ }),
    ).toBeVisible();
  });

  test("Continue without account drops into the budget shell", async ({
    page,
  }) => {
    await signInAsGuest(page);

    // The header carries the "budget" wordmark and the build label
    // baked in at build time. Their presence is the canonical post-auth
    // signal.
    await expect(page.getByText("budget", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Open menu" })).toBeVisible();
  });

  test("sign-up form refuses passwords shorter than eight characters", async ({
    page,
  }) => {
    await page.goto("./");

    await page.getByLabel("Username", { exact: true }).fill("nic");
    await page.getByLabel("Password", { exact: true }).fill("short");
    await page.getByLabel("Confirm password", { exact: true }).fill("short");

    // Inline validation surfaces the rule. The submit button stays
    // disabled until the rule is satisfied — both signals are checked
    // so a regression on either is caught.
    await expect(page.getByText("Use at least 8 characters.")).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Create account" }),
    ).toBeDisabled();
  });
});
