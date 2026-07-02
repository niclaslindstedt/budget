import { describe, expect, it } from "vitest";

import { reducer } from "../src/data/reducer";
import { validateUserData } from "../src/data/validate";
import { freshUserData } from "../src/storage/local";
import type { InsightsView, Sheet, UserData } from "../src/data/types";

function insightsSheet(item: Partial<InsightsView> = {}): Sheet {
  return {
    id: "sheet-insights",
    name: "Insights",
    type: "insights",
    glyph: "line-chart",
    color: "#61afef",
    description: "",
    items: [{ id: "view-1", type: "insightsView", ...item }],
  };
}

// A workspace carrying one entity per id-space the override sweep
// resolves against, plus the insights sheet under test.
function blob(item: Partial<InsightsView> = {}): UserData {
  const fresh = freshUserData();
  return {
    ...fresh,
    sheets: [...fresh.sheets, insightsSheet(item)],
    accounts: [{ id: "acc-1", name: "Checking" }],
    savings: [
      { id: "sav-1", kind: "savings", name: "Buffer", balanceHistory: [] },
    ],
    items: [{ id: "item-1", name: "Laptop" }],
    properties: [
      {
        id: "prop-1",
        name: "Villa",
        valueHistory: [],
        mortgages: [],
        repairs: [],
        files: [],
      },
    ],
    loans: [
      {
        id: "loan-1",
        name: "Car loan",
        kind: "car",
        payments: [],
        balanceHistory: [],
      },
    ],
    cars: [
      {
        id: "car-1",
        name: "Volvo",
        ownership: "owned",
        snapshots: [],
        expenses: [],
      },
    ],
  };
}

function viewOf(result: ReturnType<typeof validateUserData>): InsightsView {
  if (!result.ok) throw new Error("expected ok");
  const sheet = result.value.sheets.find((s) => s.type === "insights");
  const item = sheet?.items[0];
  if (item?.type !== "insightsView") throw new Error("expected insightsView");
  return item;
}

describe("validateInsightsView via validateUserData", () => {
  it("round-trips a populated view", () => {
    const data = blob({
      mode: "networth",
      networth: {
        overrides: {
          "acc-1": { excluded: true },
          "prop-1": { sharePct: 50 },
          "sav-1": { excluded: true, sharePct: 12.5 },
          "item-1": { sharePct: 1 },
          "loan-1": { excluded: true },
          "car-1": { sharePct: 50 },
        },
      },
    });
    const result = validateUserData(data);
    expect(result.ok).toBe(true);
    expect(viewOf(result)).toEqual(
      (data.sheets[1] as Sheet).items[0] as InsightsView,
    );
  });

  it("drops overrides keyed by an unknown entity id", () => {
    const result = validateUserData(
      blob({
        networth: {
          overrides: {
            "acc-1": { excluded: true },
            gone: { excluded: true },
          },
        },
      }),
    );
    expect(viewOf(result).networth?.overrides).toEqual({
      "acc-1": { excluded: true },
    });
  });

  it("normalises redundant and out-of-range override fields away", () => {
    const result = validateUserData(
      blob({
        networth: {
          overrides: {
            // 100 means "fully owned" — the absent default.
            "acc-1": { sharePct: 100 },
            // Out-of-range / non-finite shares drop; `excluded: false`
            // drops; an override left empty disappears entirely.
            "sav-1": { sharePct: 150 },
            "item-1": { sharePct: 0 },
            "prop-1": { excluded: false, sharePct: 50 },
            "loan-1": { excluded: false },
          },
        },
      }),
    );
    expect(viewOf(result).networth?.overrides).toEqual({
      "prop-1": { sharePct: 50 },
    });
  });

  it("collapses an all-dangling overrides map to no networth field", () => {
    const result = validateUserData(
      blob({ networth: { overrides: { gone: { excluded: true } } } }),
    );
    expect(viewOf(result).networth).toBeUndefined();
  });

  it("drops an unknown mode but keeps a known one", () => {
    const unknown = validateUserData(blob({ mode: "cashflow" as never }));
    expect(viewOf(unknown).mode).toBeUndefined();
    const known = validateUserData(blob({ mode: "networth" }));
    expect(viewOf(known).mode).toBe("networth");
  });
});

describe("setInsightsNetWorthSettings reducer", () => {
  it("persists a normalised copy of the payload", () => {
    const next = reducer(blob(), {
      type: "setInsightsNetWorthSettings",
      sheetId: "sheet-insights",
      itemId: "view-1",
      settings: {
        overrides: {
          "acc-1": { excluded: true, sharePct: 100 },
          "prop-1": { sharePct: 50 },
          "sav-1": { excluded: false, sharePct: 250 },
        },
      },
    });
    const item = next.sheets[1].items[0] as InsightsView;
    expect(item.networth).toEqual({
      overrides: {
        "acc-1": { excluded: true },
        "prop-1": { sharePct: 50 },
      },
    });
  });

  it("drops the networth field when everything normalises away", () => {
    const withSettings = reducer(blob(), {
      type: "setInsightsNetWorthSettings",
      sheetId: "sheet-insights",
      itemId: "view-1",
      settings: { overrides: { "acc-1": { excluded: true } } },
    });
    const cleared = reducer(withSettings, {
      type: "setInsightsNetWorthSettings",
      sheetId: "sheet-insights",
      itemId: "view-1",
      settings: { overrides: { "acc-1": { excluded: false } } },
    });
    const item = cleared.sheets[1].items[0] as InsightsView;
    expect(item.networth).toBeUndefined();
    expect("networth" in item).toBe(false);
  });

  it("returns the same state when nothing changes", () => {
    const prev = reducer(blob(), {
      type: "setInsightsNetWorthSettings",
      sheetId: "sheet-insights",
      itemId: "view-1",
      settings: { overrides: { "prop-1": { sharePct: 50 } } },
    });
    const again = reducer(prev, {
      type: "setInsightsNetWorthSettings",
      sheetId: "sheet-insights",
      itemId: "view-1",
      settings: { overrides: { "prop-1": { sharePct: 50, excluded: false } } },
    });
    expect(again).toBe(prev);
  });
});
