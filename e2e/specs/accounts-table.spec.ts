import { expect, signInAsGuest, test } from "../fixtures";

// Accounts table flows. A fresh guest gets the default Budget sheet
// only — the suite spins up an Accounts sheet through the new-sheet
// flow first, then exercises the per-row action strip introduced when
// the table was redesigned to mirror the budget sheet's swipe
// affordance: create → edit (pen) → delete (trash, with confirm) →
// overflow menu (Import / Cut history).

async function openAccountsSheet(page: import("@playwright/test").Page) {
  // Open the New sheet modal from the BottomBar tablist, pick the
  // Accounts flavour from the type picker, and confirm. The sheet
  // auto-activates on creation so the heading shows up without an
  // extra tab click.
  await page.getByRole("button", { name: "New sheet", exact: true }).click();
  const modal = page.getByRole("dialog");
  await modal.getByRole("textbox", { name: "Name" }).fill("Accounts");
  // The type listbox defaults to Budget — open it and pick the
  // Accounts entry. The trigger is the only popup button inside the
  // modal so we can target it by its aria-expanded state.
  await modal.getByRole("button", { expanded: false }).first().click();
  await page.getByRole("option", { name: "Accounts" }).click();
  await modal.getByRole("button", { name: /^Create/ }).click();
  // Sheet title (h2) and table section heading (h3) both read
  // "Accounts" — disambiguate on heading level so the assertion
  // doesn't trip strict-mode.
  await expect(
    page.getByRole("heading", { name: "Accounts", level: 2 }),
  ).toBeVisible();
}

async function createAccount(
  page: import("@playwright/test").Page,
  name: string,
) {
  await page.getByRole("button", { name: "Add account" }).click();
  // Scope to the dialog so the accounts-table's "Name" columnheader
  // (also exposed by aria-label) doesn't trip strict-mode.
  const modal = page.getByRole("dialog");
  await modal.getByRole("textbox", { name: "Name" }).fill(name);
  await modal.getByRole("button", { name: /^Create/ }).click();
  // Wait for the new row to land — the row exposes multiple buttons
  // (view-history, edit, delete, more) all keyed off the account name,
  // so target the edit button for an unambiguous "row exists" probe.
  await expect(
    page.getByRole("button", { name: `Edit ${name}`, exact: true }),
  ).toBeVisible();
}

test.describe("Accounts table", () => {
  test("renders the accounts header and the empty-state row", async ({
    page,
  }) => {
    await signInAsGuest(page);
    await openAccountsSheet(page);

    await expect(
      page.getByText("No accounts yet. Add one with the button below."),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Add account" }),
    ).toBeVisible();
  });

  test("history-count column reads zero for a freshly added account", async ({
    page,
  }) => {
    await signInAsGuest(page);
    await openAccountsSheet(page);
    await createAccount(page, "Travel fund");

    // The new history-count column reads "0" for a freshly-added
    // account. Both the name and the count cells share the
    // "View history for <name>" aria-label since both open the
    // viewer — target the count cell by its explicit `0` text.
    const row = page.getByRole("row").filter({ hasText: "Travel fund" });
    await expect(
      row.getByRole("button", { name: "View history for Travel fund" }).filter({
        hasText: "0",
      }),
    ).toBeVisible();
  });

  test("trash button opens a confirm modal and deletes on confirm", async ({
    page,
  }) => {
    await signInAsGuest(page);
    await openAccountsSheet(page);
    await createAccount(page, "Cash");

    await page.getByRole("button", { name: "Delete Cash" }).click();

    // The shared ConfirmDialog reuses the same "Delete account" copy
    // the AccountModal's delete button surfaces.
    const dialog = page.getByRole("alertdialog");
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/Cash.*permanently removed/i);

    await dialog.getByRole("button", { name: "Delete account" }).click();
    // The row is gone — the unambiguous "Edit Cash" pen button no
    // longer exists. Pair-buttons keyed on the account name (view,
    // edit, delete, more) all disappear together so a single absent
    // probe is enough.
    await expect(
      page.getByRole("button", { name: "Edit Cash", exact: true }),
    ).not.toBeVisible();
  });

  test("more menu exposes the Import and Cut history actions", async ({
    page,
  }) => {
    await signInAsGuest(page);
    await openAccountsSheet(page);
    await createAccount(page, "Wallet");

    await page.getByRole("button", { name: "More actions for Wallet" }).click();
    const menu = page.getByRole("menu");
    await expect(
      menu.getByRole("menuitem", { name: "Import bank history" }),
    ).toBeVisible();
    await expect(
      menu.getByRole("menuitem", { name: "Cut history before a date" }),
    ).toBeVisible();
  });
});
