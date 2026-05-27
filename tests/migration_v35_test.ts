// v34 → v35 migration. Splits the flat `Settings` into common +
// device scopes, absorbs three surfaces from device-local
// localStorage, and clears the absorbed keys. The migration runs once
// per device; subsequent loads operate purely on the synced bucket.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  DEFAULT_DOWNLOAD_ACCOUNTS,
  DEFAULT_DOWNLOAD_BUDGET,
  DEFAULT_SETTINGS,
} from "../src/data/constants/defaults";
import { LATEST_VERSION, migrate } from "../src/data/migrations";
import { validateUserData } from "../src/data/validate";

function v34Sample(settingsOverrides: Record<string, unknown> = {}): {
  version: number;
  [key: string]: unknown;
} {
  return {
    version: 34,
    activeSheetId: "s1",
    accounts: [],
    categories: [],
    types: [],
    hiddenPresetTypeIds: [],
    presetTypeKindOverrides: {},
    hiddenPresetCategoryIds: [],
    transactions: [],
    history: {},
    historyImports: {},
    merchantHints: {},
    recurringDismissals: [],
    transferCollapseDismissals: [],
    matchRules: [],
    seriesMatchRules: [],
    settings: {
      ...DEFAULT_SETTINGS,
      ...settingsOverrides,
    },
    sheets: [
      {
        id: "s1",
        name: "Migrated",
        type: "budget",
        glyph: "wallet",
        color: "#61afef",
        description: "",
        items: [],
      },
    ],
  };
}

// Minimal in-memory localStorage so the migration can read and clear
// keys without touching the surrounding test environment.
class InMemoryStorage {
  private store = new Map<string, string>();
  getItem(key: string): string | null {
    return this.store.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }
  removeItem(key: string): void {
    this.store.delete(key);
  }
  clear(): void {
    this.store.clear();
  }
  get length(): number {
    return this.store.size;
  }
  key(index: number): string | null {
    return Array.from(this.store.keys())[index] ?? null;
  }
  has(key: string): boolean {
    return this.store.has(key);
  }
}

describe("v34 → v35 migration", () => {
  let storage: InMemoryStorage;

  beforeEach(() => {
    storage = new InMemoryStorage();
    vi.stubGlobal("localStorage", storage);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("splits a non-default device field into both buckets", () => {
    const v34 = v34Sample({
      abbreviateNumbers: true,
      fontScale: 1.25,
      showCurrency: false,
      headerAction: { kind: "refresh" },
    });
    const { data, migrated } = migrate(v34);
    expect(migrated).toBe(true);
    expect(data.version).toBe(LATEST_VERSION);
    const settings = (
      data as unknown as {
        settings: {
          device: {
            mobile: Record<string, unknown>;
            desktop: Record<string, unknown>;
          };
        };
      }
    ).settings;
    expect(settings.device.mobile.abbreviateNumbers).toBe(true);
    expect(settings.device.desktop.abbreviateNumbers).toBe(true);
    expect(settings.device.mobile.fontScale).toBe(1.25);
    expect(settings.device.desktop.fontScale).toBe(1.25);
    expect(settings.device.mobile.showCurrency).toBe(false);
    expect(settings.device.desktop.showCurrency).toBe(false);
    expect(settings.device.mobile.headerAction).toEqual({ kind: "refresh" });
    expect(settings.device.desktop.headerAction).toEqual({ kind: "refresh" });
  });

  it("strips device-scoped fields from the top level of settings", () => {
    const v34 = v34Sample({
      abbreviateNumbers: true,
      fontScale: 1.25,
      headerAction: { kind: "refresh" },
    });
    const { data } = migrate(v34);
    const settings = (
      data as unknown as {
        settings: Record<string, unknown>;
      }
    ).settings;
    expect(settings.abbreviateNumbers).toBeUndefined();
    expect(settings.fontScale).toBeUndefined();
    expect(settings.headerAction).toBeUndefined();
    expect(settings.showCurrency).toBeUndefined();
    expect(settings.formatNumbers).toBeUndefined();
  });

  it("seeds defaults when settings is missing entirely", () => {
    const v34 = v34Sample();
    delete (v34 as { settings?: unknown }).settings;
    const { data, migrated } = migrate(v34);
    expect(migrated).toBe(true);
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.value.settings.device.mobile.fontScale).toBe(
        DEFAULT_SETTINGS.fontScale,
      );
      expect(validated.value.settings.device.desktop.fontScale).toBe(
        DEFAULT_SETTINGS.fontScale,
      );
      expect(validated.value.settings.cloudReauthAutoOpen).toBe(
        DEFAULT_SETTINGS.cloudReauthAutoOpen,
      );
      expect(validated.value.settings.device.mobile.downloadBudget).toEqual(
        DEFAULT_DOWNLOAD_BUDGET,
      );
    }
  });

  it("absorbs cloud-reauth-auto-open from localStorage when present", () => {
    storage.setItem("budget.cloud.reauthAutoOpen", "off");
    const v34 = v34Sample();
    const { data } = migrate(v34);
    const settings = (
      data as unknown as {
        settings: { cloudReauthAutoOpen: boolean };
      }
    ).settings;
    expect(settings.cloudReauthAutoOpen).toBe(false);
    expect(storage.has("budget.cloud.reauthAutoOpen")).toBe(false);
  });

  it("defaults cloud-reauth-auto-open when localStorage is empty", () => {
    const v34 = v34Sample();
    const { data } = migrate(v34);
    const settings = (
      data as unknown as {
        settings: { cloudReauthAutoOpen: boolean };
      }
    ).settings;
    expect(settings.cloudReauthAutoOpen).toBe(
      DEFAULT_SETTINGS.cloudReauthAutoOpen,
    );
  });

  it("absorbs per-user download preferences when userId is supplied", () => {
    storage.setItem(
      "budget.download.budget.user-1",
      JSON.stringify({ format: "xlsx", includeHistory: false }),
    );
    storage.setItem(
      "budget.download.accounts.user-1",
      JSON.stringify({
        accountInfo: { "acct-1": false },
        accountTransactions: { "acct-1": true },
        accountSelected: { "acct-1": true },
        includeTransactions: false,
        includeUnconfirmed: true,
        includeFutureEntries: true,
      }),
    );
    const v34 = v34Sample();
    const { data } = migrate(v34, { userId: "user-1" });
    const device = (
      data as unknown as {
        settings: {
          device: {
            mobile: Record<string, unknown>;
            desktop: Record<string, unknown>;
          };
        };
      }
    ).settings.device;
    expect(device.mobile.downloadBudget).toEqual({
      format: "xlsx",
      includeHistory: false,
    });
    expect(device.desktop.downloadBudget).toEqual({
      format: "xlsx",
      includeHistory: false,
    });
    expect(
      (device.mobile.downloadAccounts as Record<string, unknown>)
        .includeUnconfirmed,
    ).toBe(true);
    // Localstorage keys cleared on the same pass.
    expect(storage.has("budget.download.budget.user-1")).toBe(false);
    expect(storage.has("budget.download.accounts.user-1")).toBe(false);
  });

  it("ignores per-user download preferences when userId is not supplied", () => {
    // Import path: no `userId` context. Even if a localStorage value
    // exists, it stays untouched (it might belong to a different
    // user) and the migration seeds defaults.
    storage.setItem(
      "budget.download.budget.user-1",
      JSON.stringify({ format: "xlsx", includeHistory: false }),
    );
    const v34 = v34Sample();
    const { data } = migrate(v34);
    const device = (
      data as unknown as {
        settings: { device: { mobile: Record<string, unknown> } };
      }
    ).settings.device;
    expect(device.mobile.downloadBudget).toEqual(DEFAULT_DOWNLOAD_BUDGET);
    // Untouched.
    expect(storage.has("budget.download.budget.user-1")).toBe(true);
  });

  it("survives malformed localStorage values by falling back to defaults", () => {
    storage.setItem("budget.download.budget.user-1", "{not json");
    storage.setItem("budget.download.accounts.user-1", "[]");
    const v34 = v34Sample();
    const { data } = migrate(v34, { userId: "user-1" });
    const device = (
      data as unknown as {
        settings: { device: { mobile: Record<string, unknown> } };
      }
    ).settings.device;
    expect(device.mobile.downloadBudget).toEqual(DEFAULT_DOWNLOAD_BUDGET);
    expect(device.mobile.downloadAccounts).toEqual(DEFAULT_DOWNLOAD_ACCOUNTS);
    // Even malformed keys are cleared so they don't linger.
    expect(storage.has("budget.download.budget.user-1")).toBe(false);
    expect(storage.has("budget.download.accounts.user-1")).toBe(false);
  });

  it("the migration result round-trips through validateUserData", () => {
    storage.setItem("budget.cloud.reauthAutoOpen", "on");
    storage.setItem(
      "budget.download.budget.user-1",
      JSON.stringify({ format: "xlsx", includeHistory: true }),
    );
    const v34 = v34Sample({
      abbreviateNumbers: true,
      fontScale: 1.1,
    });
    const { data } = migrate(v34, { userId: "user-1" });
    const validated = validateUserData(data);
    expect(validated.ok).toBe(true);
    if (validated.ok) {
      expect(validated.value.settings.device.mobile.fontScale).toBe(1.1);
      expect(validated.value.settings.device.desktop.fontScale).toBe(1.1);
      expect(validated.value.settings.cloudReauthAutoOpen).toBe(true);
      expect(validated.value.settings.device.mobile.downloadBudget.format).toBe(
        "xlsx",
      );
    }
  });
});
