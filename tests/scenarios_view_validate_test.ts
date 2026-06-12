import { describe, expect, it } from "vitest";

import { validateUserData } from "../src/data/validate";
import { freshUserData } from "../src/storage/local";
import type { ScenariosView, Sheet, UserData } from "../src/data/types";

function scenariosSheet(view: Partial<ScenariosView> = {}): Sheet {
  return {
    id: "sheet-scn",
    name: "Scenarios",
    type: "scenarios",
    glyph: "compass",
    color: "#61afef",
    description: "",
    items: [
      {
        id: "view-1",
        type: "scenariosView",
        baseSheetId: null,
        monitors: [],
        scenarios: [],
        ...view,
      },
    ],
  };
}

// The fresh workspace's own (budget) sheet provides a known sheet id
// the `baseSheetId` check can resolve against; the scenarios sheet
// under test is appended after it, so the binding is also a forward
// reference when it points BACK at the earlier sheet — order is
// covered the other way by `baseRefersToLaterSheet` below.
function blob(view: Partial<ScenariosView> = {}): UserData {
  const fresh = freshUserData();
  return { ...fresh, sheets: [...fresh.sheets, scenariosSheet(view)] };
}

function viewOf(result: ReturnType<typeof validateUserData>): ScenariosView {
  if (!result.ok) throw new Error("expected ok");
  const sheet = result.value.sheets.find((s) => s.type === "scenarios");
  const item = sheet?.items[0];
  if (item?.type !== "scenariosView") throw new Error("expected scenariosView");
  return item;
}

describe("validateScenariosView via validateUserData", () => {
  it("round-trips a fully populated view", () => {
    const data = blob({
      monitors: ["2026-06-30", "2026-12-31"],
      scenarios: [
        {
          id: "scn-1",
          name: "Lose my job",
          overrides: [
            { rowId: "r1", amount: 0 },
            { rowId: "r2", excluded: true },
            { rowId: "r3", modulation: { op: "add", value: 5000 } },
          ],
          addedRows: [
            {
              id: "a1",
              date: "2026-02-25",
              description: "A-kassa",
              amount: 14000,
            },
          ],
        },
      ],
    });
    // Bind to the fresh workspace's own budget sheet (its id is minted
    // per call, so resolve it off the constructed blob).
    const view = data.sheets.find((s) => s.type === "scenarios")!
      .items[0] as ScenariosView;
    view.baseSheetId = data.sheets[0].id;
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    expect(viewOf(result)).toEqual(
      data.sheets.find((s) => s.type === "scenarios")!.items[0],
    );
  });

  it("coerces a dangling baseSheetId to null", () => {
    const result = validateUserData(blob({ baseSheetId: "deleted-sheet" }));
    expect(result.ok).toBe(true);
    expect(viewOf(result).baseSheetId).toBeNull();
  });

  it("resolves a baseSheetId that points at a LATER sheet in the array", () => {
    const fresh = freshUserData();
    const data: UserData = {
      ...fresh,
      sheets: [
        scenariosSheet({ baseSheetId: fresh.sheets[0].id }),
        ...fresh.sheets,
      ],
      activeSheetId: "sheet-scn",
    };
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    expect(viewOf(result).baseSheetId).toBe(fresh.sheets[0].id);
  });

  it("sweeps, dedups, and sorts monitors", () => {
    const result = validateUserData(
      blob({
        monitors: [
          "2026-12-31",
          "not-a-date",
          "2026-06-30",
          "2026-12-31",
          "2026-6-3",
        ],
      }),
    );
    expect(viewOf(result).monitors).toEqual(["2026-06-30", "2026-12-31"]);
  });

  it("normalises overrides: drops empties, excluded:false, non-finite amounts, dupes", () => {
    const result = validateUserData(
      blob({
        scenarios: [
          {
            id: "scn-1",
            name: "S",
            overrides: [
              { rowId: "r1" },
              { rowId: "r2", excluded: false } as never,
              { rowId: "r3", amount: Number.NaN },
              { rowId: "r4", amount: 5 },
              { rowId: "r4", amount: 99 },
              { rowId: "", amount: 1 },
            ],
            addedRows: [],
          },
        ],
      }),
    );
    expect(viewOf(result).scenarios[0].overrides).toEqual([
      { rowId: "r4", amount: 5 },
    ]);
  });

  it("normalises modulations: bad ops, non-finite values, no-ops, fixed-amount shadowing", () => {
    const result = validateUserData(
      blob({
        scenarios: [
          {
            id: "scn-1",
            name: "S",
            overrides: [
              { rowId: "r1", modulation: { op: "add", value: 5000 } },
              { rowId: "r2", modulation: { op: "divide", value: 2 } } as never,
              {
                rowId: "r3",
                modulation: { op: "multiply", value: Number.NaN },
              },
              { rowId: "r4", modulation: { op: "multiply", value: 1 } },
              { rowId: "r5", modulation: { op: "percent", value: 0 } },
              // Fixed amount wins — the modulation is dropped.
              {
                rowId: "r6",
                amount: 7,
                modulation: { op: "add", value: 1 },
              },
            ],
            addedRows: [],
          },
        ],
      }),
    );
    expect(viewOf(result).scenarios[0].overrides).toEqual([
      { rowId: "r1", modulation: { op: "add", value: 5000 } },
      { rowId: "r6", amount: 7 },
    ]);
  });

  it("drops malformed added rows and dedups by id", () => {
    const result = validateUserData(
      blob({
        scenarios: [
          {
            id: "scn-1",
            name: "S",
            overrides: [],
            addedRows: [
              { id: "a1", date: "2026-01-01", description: "Keep", amount: 1 },
              { id: "a1", date: "2026-02-01", description: "Dupe", amount: 2 },
              { id: "a2", date: "nope", description: "Bad date", amount: 3 },
              { id: "", date: "2026-01-01", description: "No id", amount: 4 },
              {
                id: "a3",
                date: "2026-03-01",
                description: "Series",
                amount: 5,
                seriesId: "ser-1",
              },
              {
                id: "a4",
                date: "2026-04-01",
                description: "Empty series id",
                amount: 6,
                seriesId: "",
              },
            ],
          },
        ],
      }),
    );
    expect(viewOf(result).scenarios[0].addedRows).toEqual([
      { id: "a1", date: "2026-01-01", description: "Keep", amount: 1 },
      {
        id: "a3",
        date: "2026-03-01",
        description: "Series",
        amount: 5,
        seriesId: "ser-1",
      },
      {
        id: "a4",
        date: "2026-04-01",
        description: "Empty series id",
        amount: 6,
      },
    ]);
  });

  it("rejects duplicate scenario ids", () => {
    const result = validateUserData(
      blob({
        scenarios: [
          { id: "scn-1", name: "A", overrides: [], addedRows: [] },
          { id: "scn-1", name: "B", overrides: [], addedRows: [] },
        ],
      }),
    );
    expect(result.ok).toBe(false);
  });
});
