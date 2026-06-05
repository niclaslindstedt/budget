import { describe, expect, it } from "vitest";

import { reducer } from "../src/data/reducer";
import { MAX_FAVORITE_SHEETS, createDefaultSheet } from "../src/data/sheet";
import { freshUserData } from "../src/storage/local";
import type { Sheet, UserData } from "../src/data/types";

function withSheets(sheets: Sheet[]): UserData {
  return { ...freshUserData(), sheets, activeSheetId: sheets[0].id };
}

function favorited(name: string): Sheet {
  return { ...createDefaultSheet(name), favorite: true };
}

describe("toggleSheetFavorite reducer", () => {
  it("favorites a sheet", () => {
    const s = createDefaultSheet("Budget");
    const next = reducer(withSheets([s]), {
      type: "toggleSheetFavorite",
      sheetId: s.id,
    });
    expect(next.sheets[0].favorite).toBe(true);
  });

  it("unfavorites by dropping the flag (not storing false)", () => {
    const s = favorited("Budget");
    const next = reducer(withSheets([s]), {
      type: "toggleSheetFavorite",
      sheetId: s.id,
    });
    expect("favorite" in next.sheets[0]).toBe(false);
  });

  it("is a no-op once the favorite cap is reached", () => {
    expect(MAX_FAVORITE_SHEETS).toBe(5);
    const favs = Array.from({ length: MAX_FAVORITE_SHEETS }, (_, i) =>
      favorited(`F${i}`),
    );
    const extra = createDefaultSheet("Extra");
    const next = reducer(withSheets([...favs, extra]), {
      type: "toggleSheetFavorite",
      sheetId: extra.id,
    });
    expect(
      next.sheets.find((s) => s.id === extra.id)?.favorite,
    ).toBeUndefined();
    expect(next.sheets.filter((s) => s.favorite).length).toBe(
      MAX_FAVORITE_SHEETS,
    );
  });

  it("still lets you unfavorite while at the cap", () => {
    const favs = Array.from({ length: MAX_FAVORITE_SHEETS }, (_, i) =>
      favorited(`F${i}`),
    );
    const next = reducer(withSheets(favs), {
      type: "toggleSheetFavorite",
      sheetId: favs[0].id,
    });
    expect("favorite" in next.sheets[0]).toBe(false);
    expect(next.sheets.filter((s) => s.favorite).length).toBe(
      MAX_FAVORITE_SHEETS - 1,
    );
  });

  it("ignores an unknown sheet id", () => {
    const s = createDefaultSheet("Budget");
    const next = reducer(withSheets([s]), {
      type: "toggleSheetFavorite",
      sheetId: "nope",
    });
    expect(next.sheets[0].favorite).toBeUndefined();
  });
});
