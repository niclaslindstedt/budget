import { describe, expect, it } from "vitest";

import { reducer } from "../src/data/reducer";
import { freshUserData } from "../src/storage/local";
import type { AccountBudget, Tag, UserData } from "../src/data/types";

// Seed a workspace with one budget item holding the given rows so the
// deleteTag cascade has something to sweep.
function withRows(rows: AccountBudget["rows"], tags: Tag[] = []): UserData {
  const base = freshUserData();
  const sheet = base.sheets[0];
  const item = sheet.items.find(
    (i): i is AccountBudget => i.type === "accountBudget",
  );
  if (!item) throw new Error("expected an accountBudget item in the seed");
  return {
    ...base,
    tags,
    sheets: [{ ...sheet, items: [{ ...item, rows }] }],
  };
}

function firstBudgetRows(data: UserData): AccountBudget["rows"] {
  const item = data.sheets[0].items.find(
    (i): i is AccountBudget => i.type === "accountBudget",
  );
  if (!item) throw new Error("expected an accountBudget item");
  return item.rows;
}

describe("tag reducer", () => {
  it("adds a tag", () => {
    const tag: Tag = { id: "t1", name: "Vacation", color: "#fa7c33" };
    const next = reducer(withRows([]), { type: "addTag", tag });
    expect(next.tags).toEqual([tag]);
  });

  it("updates a tag in place", () => {
    const tag: Tag = { id: "t1", name: "Vacation", color: "#fa7c33" };
    const next = reducer(withRows([], [tag]), {
      type: "updateTag",
      tagId: "t1",
      patch: { name: "Holiday", color: "#61afef" },
    });
    expect(next.tags).toEqual([
      { id: "t1", name: "Holiday", color: "#61afef" },
    ]);
  });

  it("deleting a tag strips it from every row's tagIds", () => {
    const tag: Tag = { id: "t1", name: "Vacation", color: "#fa7c33" };
    const data = withRows(
      [
        { kind: "user", id: "r1", cells: {}, tagIds: ["t1", "t2"] },
        { kind: "user", id: "r2", cells: {}, tagIds: ["t1"] },
        { kind: "user", id: "r3", cells: {} },
      ],
      [tag, { id: "t2", name: "Work", color: "#98c379" }],
    );
    const next = reducer(data, { type: "deleteTag", tagId: "t1" });
    expect(next.tags.map((t) => t.id)).toEqual(["t2"]);
    const rows = firstBudgetRows(next);
    // r1 keeps the surviving tag, r2's array empties and the field is
    // dropped entirely, r3 is untouched.
    expect(rows[0].tagIds).toEqual(["t2"]);
    expect(rows[1].tagIds).toBeUndefined();
    expect(rows[2].tagIds).toBeUndefined();
  });
});
