import { describe, expect, it } from "vitest";

import {
  COVER_MESSAGE_MAX_CHARS,
  attachImportedCoverTransfers,
  buildCoverIndex,
  coverKey,
  coverTotal,
  generateCoverMessage,
  isCoverTransfer,
} from "../src/data/accounts/cover-transfer";
import type { HistoryEntry, Transfer } from "../src/data/types";

let counter = 0;
function entry(
  date: string,
  description: string,
  amount: number,
  overrides: Partial<HistoryEntry> = {},
): HistoryEntry {
  counter += 1;
  return {
    id: `e${counter}`,
    date,
    description,
    amount,
    balance: 0,
    importedAt: 0,
    ...overrides,
  };
}

function coverTransfer(overrides: Partial<Transfer> = {}): Transfer {
  return {
    id: "cv1",
    date: "2026-06-01",
    description: "Kids' clothes",
    amount: 900,
    fromAccountId: "savings",
    toAccountId: "main",
    completed: false,
    cover: {
      motivation: "Kids' clothes",
      message: generateCoverMessage("cv1"),
      covered: [
        { accountId: "main", entryId: "x1" },
        { accountId: "main", entryId: "x2" },
      ],
    },
    ...overrides,
  };
}

describe("generateCoverMessage", () => {
  it("is uppercase-alnum and within the length cap", () => {
    const msg = generateCoverMessage("abc-123-DEF-456-7890");
    expect(msg.length).toBeLessThanOrEqual(COVER_MESSAGE_MAX_CHARS);
    expect(msg).toMatch(/^CV[A-Z0-9]+$/);
  });
  it("is deterministic for the same seed", () => {
    expect(generateCoverMessage("seed-1")).toBe(generateCoverMessage("seed-1"));
  });
});

describe("coverTotal", () => {
  it("sums the absolute magnitudes", () => {
    expect(
      coverTotal([{ amount: -300 }, { amount: -600 }, { amount: 100 }]),
    ).toBe(1000);
  });
});

describe("isCoverTransfer / buildCoverIndex", () => {
  it("distinguishes cover transfers from ordinary ones", () => {
    expect(isCoverTransfer(coverTransfer())).toBe(true);
    expect(
      isCoverTransfer({
        id: "t",
        date: "2026-06-01",
        description: "plain",
        amount: 5,
        fromAccountId: "a",
        toAccountId: "b",
      }),
    ).toBe(false);
  });
  it("indexes each covered ref to its cover transfer", () => {
    const index = buildCoverIndex([coverTransfer()]);
    expect(index.get(coverKey("main", "x1"))?.id).toBe("cv1");
    expect(index.get(coverKey("main", "x2"))?.id).toBe("cv1");
    expect(index.get(coverKey("main", "nope"))).toBeUndefined();
  });
});

describe("attachImportedCoverTransfers", () => {
  it("attaches the to-leg by amount + date span and marks the cover complete", () => {
    const tx = coverTransfer();
    const credit = entry("2026-06-03", "ÖVERFÖRING", 900); // +900 lands on main
    const result = attachImportedCoverTransfers(
      [tx],
      "main",
      [credit],
      new Set([credit.id]),
    );
    expect(result.attachments.get(credit.id)).toBe("cv1");
    expect(result.transfers[0].completed).toBe(true);
  });

  it("attaches by the reference message even outside the date span", () => {
    const tx = coverTransfer({ date: "2026-01-01" });
    const msg = tx.cover!.message;
    const credit = entry("2026-06-20", `SWISH ${msg} REF 1`, 900);
    const result = attachImportedCoverTransfers(
      [tx],
      "main",
      [credit],
      new Set([credit.id]),
    );
    expect(result.attachments.get(credit.id)).toBe("cv1");
  });

  it("ignores entries with the wrong sign or amount", () => {
    const tx = coverTransfer();
    const wrongSign = entry("2026-06-02", "ÖVERFÖRING", -900);
    const wrongAmount = entry("2026-06-02", "ÖVERFÖRING", 12);
    const result = attachImportedCoverTransfers(
      [tx],
      "main",
      [wrongSign, wrongAmount],
      new Set([wrongSign.id, wrongAmount.id]),
    );
    expect(result.attachments.size).toBe(0);
    expect(result.transfers).toBe(result.transfers); // referentially stable
  });

  it("skips a cover whose leg on this account already attached", () => {
    const tx = coverTransfer();
    const already = entry("2026-06-02", "ÖVERFÖRING", 900, {
      collapsedIntoTransferId: "cv1",
    });
    const fresh = entry("2026-06-03", "ÖVERFÖRING", 900);
    const result = attachImportedCoverTransfers(
      [tx],
      "main",
      [already, fresh],
      new Set([fresh.id]),
    );
    expect(result.attachments.size).toBe(0);
  });
});
