import { describe, expect, it, vi } from "vitest";

import {
  applyModalCommand,
  type ModalCommand,
  type ModalCommandHandlers,
} from "../src/components/modal-dispatch";

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
});
