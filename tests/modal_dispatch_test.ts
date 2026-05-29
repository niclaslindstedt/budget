import { describe, expect, it, vi } from "vitest";

import {
  applyModalCommand,
  mergeHandlerSlices,
  type ModalCommand,
  type ModalCommandHandlers,
  type PartialModalCommandHandlers,
} from "../src/components/modal-dispatch";
import type { Row } from "../src/data/types";

// A budget row only needs an id for the routing table — the dispatcher
// forwards the reference unchanged without inspecting any other field.
const ROW = { id: "row-1" } as Row;

function makeHandlers(): ModalCommandHandlers {
  return {
    openSettings: vi.fn(),
    openChangelog: vi.fn(),
    openSearch: vi.fn(),
    openActionHistory: vi.fn(),
    openAchievementsList: vi.fn(),
    openAchievementsUnlock: vi.fn(),
    openSyncDetails: vi.fn(),
    openNewSheet: vi.fn(),
    openEditSheet: vi.fn(),
    openDownloadSheet: vi.fn(),
    editEntry: vi.fn(),
    editRow: vi.fn(),
    deleteRow: vi.fn(),
    splitRow: vi.fn(),
    transferRow: vi.fn(),
    matchRule: vi.fn(),
    editHistory: vi.fn(),
    copyRow: vi.fn(),
    correctionDelete: vi.fn(),
  };
}

// Each command routes to exactly one handler — the pair drives the
// table so a new command without a matching handler is a compile error
// and a mis-wired switch arm is a test failure.
const cases: ReadonlyArray<[ModalCommand, keyof ModalCommandHandlers]> = [
  [{ kind: "open-settings" }, "openSettings"],
  [{ kind: "open-changelog" }, "openChangelog"],
  [{ kind: "open-search" }, "openSearch"],
  [{ kind: "open-action-history" }, "openActionHistory"],
  [{ kind: "open-achievements-list" }, "openAchievementsList"],
  [{ kind: "open-achievements-unlock" }, "openAchievementsUnlock"],
  [{ kind: "open-sync-details" }, "openSyncDetails"],
  [{ kind: "open-new-sheet" }, "openNewSheet"],
  [{ kind: "open-edit-sheet", sheetId: "s1" }, "openEditSheet"],
  [{ kind: "open-download-sheet", sheetId: "s1" }, "openDownloadSheet"],
  [{ kind: "open-edit-entry", row: ROW }, "editEntry"],
  [{ kind: "open-edit-row", row: ROW }, "editRow"],
  [{ kind: "open-delete-row", row: ROW }, "deleteRow"],
  [{ kind: "open-split-row", row: ROW }, "splitRow"],
  [{ kind: "open-transfer-row", row: ROW }, "transferRow"],
  [{ kind: "open-match-rule", row: ROW }, "matchRule"],
  [{ kind: "open-edit-history", row: ROW }, "editHistory"],
  [{ kind: "open-copy-row", row: ROW }, "copyRow"],
  [{ kind: "open-correction-delete", row: ROW }, "correctionDelete"],
];

describe("applyModalCommand", () => {
  for (const [command, expected] of cases) {
    it(`${command.kind} calls only ${expected}`, () => {
      const handlers = makeHandlers();
      applyModalCommand(command, handlers);
      for (const key of Object.keys(handlers) as Array<
        keyof ModalCommandHandlers
      >) {
        expect(handlers[key]).toHaveBeenCalledTimes(key === expected ? 1 : 0);
      }
    });
  }

  // The sheet-meta / download commands carry the id they act on; the
  // dispatcher must forward it to the handler unchanged.
  it("forwards sheetId to openEditSheet", () => {
    const handlers = makeHandlers();
    applyModalCommand({ kind: "open-edit-sheet", sheetId: "abc" }, handlers);
    expect(handlers.openEditSheet).toHaveBeenCalledWith("abc");
  });

  it("forwards sheetId to openDownloadSheet", () => {
    const handlers = makeHandlers();
    applyModalCommand(
      { kind: "open-download-sheet", sheetId: "xyz" },
      handlers,
    );
    expect(handlers.openDownloadSheet).toHaveBeenCalledWith("xyz");
  });

  // The budget-row commands carry the Row the user acted on; the
  // dispatcher must forward the same reference to the handler unchanged
  // so the AppShell handler can apply its own guards (savable-row check,
  // synthesized-row suppression) against the real row.
  it("forwards the row reference to deleteRow", () => {
    const handlers = makeHandlers();
    applyModalCommand({ kind: "open-delete-row", row: ROW }, handlers);
    expect(handlers.deleteRow).toHaveBeenCalledWith(ROW);
  });

  it("forwards the row reference to correctionDelete", () => {
    const handlers = makeHandlers();
    applyModalCommand({ kind: "open-correction-delete", row: ROW }, handlers);
    expect(handlers.correctionDelete).toHaveBeenCalledWith(ROW);
  });
});

// The provider merges AppShell's base slice with the slices modal hosts
// register, so a handler can travel with the state it opens. The merge
// itself is pure and unit-tested here without rendering the provider.
describe("mergeHandlerSlices", () => {
  it("returns a copy of the base when no slices are registered", () => {
    const openSettings = vi.fn();
    const base: PartialModalCommandHandlers = { openSettings };
    const merged = mergeHandlerSlices(base, []);
    expect(merged).toEqual({ openSettings });
    expect(merged).not.toBe(base);
  });

  it("fills a handler the base slice omits from a registered slice", () => {
    const openSettings = vi.fn();
    const openActionHistory = vi.fn();
    const merged = mergeHandlerSlices({ openSettings }, [
      { openActionHistory },
    ]);
    expect(merged.openSettings).toBe(openSettings);
    expect(merged.openActionHistory).toBe(openActionHistory);
  });

  it("lets a later slice win on a key collision", () => {
    const fromBase = vi.fn();
    const fromSlice = vi.fn();
    const merged = mergeHandlerSlices({ openActionHistory: fromBase }, [
      { openActionHistory: fromSlice },
    ]);
    expect(merged.openActionHistory).toBe(fromSlice);
  });

  it("merges several disjoint slices into one table", () => {
    const a = vi.fn();
    const b = vi.fn();
    const c = vi.fn();
    const merged = mergeHandlerSlices({ openSettings: a }, [
      { openActionHistory: b },
      { openSearch: c },
    ]);
    expect(merged).toEqual({
      openSettings: a,
      openActionHistory: b,
      openSearch: c,
    });
  });
});
