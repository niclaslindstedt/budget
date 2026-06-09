import { describe, expect, it } from "vitest";

import { LATEST_VERSION, migrate } from "../src/data/migrations";

// The v70 → v71 step repairs history entries stranded by a pre-fix
// `cutAccountHistory`: a bank entry left `hidden` with a
// `collapsedIntoTransferId` pointing at a transfer that no longer
// exists is un-hidden and has its dangling backref cleared, so the leg
// reappears and can re-pair on a future import.
describe("migration v70 → v71 (repair dangling collapsed entries)", () => {
  it("un-hides and clears the backref on entries pointing at a missing transfer", () => {
    const result = migrate({
      version: 70,
      sheets: [],
      activeSheetId: "s1",
      accounts: [],
      transfers: [],
      history: {
        "acc-1": [
          {
            id: "h1",
            date: "2026-05-01",
            description: "Överföring buffert",
            amount: -100,
            importedAt: 0,
            hidden: true,
            collapsedIntoTransferId: "gone",
          },
        ],
      },
    });

    expect(result.data.version).toBe(LATEST_VERSION);
    const entry = (
      result.data.history as Record<string, Array<Record<string, unknown>>>
    )["acc-1"][0];
    expect("collapsedIntoTransferId" in entry).toBe(false);
    expect("hidden" in entry).toBe(false);
    expect(entry.id).toBe("h1");
  });

  it("leaves entries pointing at a surviving transfer untouched", () => {
    const result = migrate({
      version: 70,
      sheets: [],
      activeSheetId: "s1",
      accounts: [],
      transfers: [
        {
          id: "t1",
          date: "2026-05-01",
          description: "to buffer",
          amount: 100,
          fromAccountId: "acc-1",
          toAccountId: "sav-1",
        },
      ],
      history: {
        "acc-1": [
          {
            id: "h1",
            date: "2026-05-01",
            description: "Överföring buffert",
            amount: -100,
            importedAt: 0,
            hidden: true,
            collapsedIntoTransferId: "t1",
          },
        ],
      },
    });

    const entry = (
      result.data.history as Record<string, Array<Record<string, unknown>>>
    )["acc-1"][0];
    expect(entry.collapsedIntoTransferId).toBe("t1");
    expect(entry.hidden).toBe(true);
  });

  it("leaves ordinary (never-collapsed) entries untouched", () => {
    const result = migrate({
      version: 70,
      sheets: [],
      activeSheetId: "s1",
      accounts: [],
      transfers: [],
      history: {
        "acc-1": [
          {
            id: "h1",
            date: "2026-05-01",
            description: "Groceries",
            amount: -250,
            importedAt: 0,
          },
        ],
      },
    });

    const entry = (
      result.data.history as Record<string, Array<Record<string, unknown>>>
    )["acc-1"][0];
    expect("hidden" in entry).toBe(false);
    expect(entry.amount).toBe(-250);
  });

  it("tolerates a missing history map", () => {
    const result = migrate({
      version: 70,
      sheets: [],
      activeSheetId: "s1",
      accounts: [],
    });
    expect(result.data.version).toBe(LATEST_VERSION);
  });
});
