import { describe, expect, it } from "vitest";

import {
  coverageDelta,
  coveredMonths,
  isDateCovered,
  isMonthCovered,
  nextMonthKey,
  nextUncoveredDate,
} from "../src/data/coverage";
import type { Column, HistoryEntry, Row } from "../src/data/types";

const dateCol: Column = { id: "d", type: "date", label: "Date" };
const amtCol: Column = { id: "a", type: "amount", label: "Amount" };
const columns: Column[] = [dateCol, amtCol];

function row(id: string, date: string): Row {
  return { id, cells: { [dateCol.id]: date, [amtCol.id]: -100 } };
}

function hist(id: string, date: string): HistoryEntry {
  return { id, date, description: "x", amount: -1, importedAt: 1 };
}

describe("isMonthCovered (bracketing)", () => {
  it("is covered when bracketed and user has rows in the month", () => {
    const h = [hist("a", "2026-03-31"), hist("b", "2026-05-01")];
    const userRows = [row("u1", "2026-04-15")];
    expect(isMonthCovered("2026-04", h, userRows)).toBe(true);
  });

  it("is covered when no entry before but no user rows in month", () => {
    const h = [hist("a", "2026-04-03"), hist("b", "2026-05-01")];
    expect(isMonthCovered("2026-04", h, [])).toBe(true);
  });

  it("is NOT covered when no entry before AND user rows exist", () => {
    const h = [hist("a", "2026-04-03"), hist("b", "2026-05-01")];
    expect(isMonthCovered("2026-04", h, [row("u", "2026-04-15")])).toBe(false);
  });

  it("is NOT covered when no entry after (last month of import)", () => {
    const h = [hist("a", "2026-03-31"), hist("b", "2026-04-28")];
    expect(isMonthCovered("2026-04", h, [])).toBe(false);
  });

  it("rejects malformed month keys", () => {
    expect(isMonthCovered("bad", [hist("a", "2026-04-01")], [])).toBe(false);
  });
});

describe("coveredMonths — worked example", () => {
  // Import March 3 → June 28, user entries only April and later.
  const history: HistoryEntry[] = [
    hist("a1", "2026-03-03"),
    hist("a2", "2026-03-31"),
    hist("a3", "2026-04-15"),
    hist("a4", "2026-05-20"),
    hist("a5", "2026-06-28"),
  ];
  const rows: Row[] = [
    row("r1", "2026-04-10"),
    row("r2", "2026-05-10"),
    row("r3", "2026-06-10"),
  ];

  const covered = coveredMonths(history, rows, columns);

  it("covers Feb (no user rows, history after)", () => {
    expect(covered.has("2026-02")).toBe(true);
  });

  it("covers March (no user rows, history after)", () => {
    expect(covered.has("2026-03")).toBe(true);
  });

  it("covers April (bracketed by history)", () => {
    expect(covered.has("2026-04")).toBe(true);
  });

  it("covers May (bracketed by history)", () => {
    expect(covered.has("2026-05")).toBe(true);
  });

  it("does NOT cover June (no history after June 28)", () => {
    expect(covered.has("2026-06")).toBe(false);
  });

  it("does NOT cover July+", () => {
    expect(covered.has("2026-07")).toBe(false);
  });
});

describe("coveredMonths — single-entry history", () => {
  it("covers the month before a single entry (no user rows, history after)", () => {
    const covered = coveredMonths([hist("a", "2026-04-15")], [], columns);
    expect([...covered]).toEqual(["2026-03"]);
  });

  it("returns empty for empty history", () => {
    expect(coveredMonths([], [], columns).size).toBe(0);
  });
});

describe("coverageDelta", () => {
  it("returns only newly-covered months", () => {
    const before = new Set(["2026-03", "2026-04"]);
    const after = new Set(["2026-03", "2026-04", "2026-05"]);
    expect([...coverageDelta(before, after)]).toEqual(["2026-05"]);
  });

  it("is empty when nothing changed", () => {
    const same = new Set(["2026-03"]);
    expect(coverageDelta(same, same).size).toBe(0);
  });
});

describe("nextMonthKey", () => {
  it("rolls December into January", () => {
    expect(nextMonthKey("2026-12")).toBe("2027-01");
  });

  it("increments other months", () => {
    expect(nextMonthKey("2026-03")).toBe("2026-04");
  });
});

describe("nextUncoveredDate", () => {
  const history: HistoryEntry[] = [
    hist("a1", "2026-03-03"),
    hist("a2", "2026-06-28"),
  ];

  it("returns the date unchanged when already in an uncovered month", () => {
    expect(nextUncoveredDate("2026-07-15", history, [], columns)).toBe(
      "2026-07-15",
    );
  });

  it("snaps forward when the date sits in a covered month", () => {
    // April is bracketed by March 3 and June 28; without user rows
    // March, April, May are all covered. June is not (no history >
    // June 28). So a date inside April snaps to the first uncovered
    // month start.
    const snapped = nextUncoveredDate("2026-04-15", history, [], columns);
    expect(snapped).toBe("2026-06-01");
  });
});

describe("isDateCovered", () => {
  const history: HistoryEntry[] = [
    hist("a1", "2026-03-03"),
    hist("a2", "2026-06-28"),
  ];

  it("true for a date in a covered month", () => {
    expect(isDateCovered("2026-04-15", history, [], columns)).toBe(true);
  });

  it("false for a date in an uncovered month", () => {
    expect(isDateCovered("2026-07-15", history, [], columns)).toBe(false);
  });
});
