import { describe, expect, it } from "vitest";

import { detectTransferCandidates } from "../src/data/transfer-collapse";
import type { HistoryEntry } from "../src/data/types";

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

describe("detectTransferCandidates", () => {
  it("finds a single same-day Swish pair", () => {
    const out = detectTransferCandidates({
      history: {
        a1: [entry("2026-05-01", "Swish till sparkonto", -2000)],
        a2: [entry("2026-05-01", "Swish från checking", 2000)],
      },
    });
    expect(out).toHaveLength(1);
    expect(out[0].fromAccountId).toBe("a1");
    expect(out[0].toAccountId).toBe("a2");
    expect(out[0].amount).toBe(2000);
    expect(out[0].date).toBe("2026-05-01");
    expect(out[0].confidence).toBeGreaterThan(0.8);
  });

  it("matches pairs within a three-day window", () => {
    const out = detectTransferCandidates({
      history: {
        a1: [entry("2026-05-01", "Transfer to savings", -500)],
        a2: [entry("2026-05-04", "Transfer from checking", 500)],
      },
    });
    expect(out).toHaveLength(1);
    expect(out[0].date).toBe("2026-05-01");
  });

  it("rejects pairs more than three days apart", () => {
    const out = detectTransferCandidates({
      history: {
        a1: [entry("2026-05-01", "Transfer", -500)],
        a2: [entry("2026-05-10", "Transfer", 500)],
      },
    });
    expect(out).toHaveLength(0);
  });

  it("rejects same-sign pairs", () => {
    const out = detectTransferCandidates({
      history: {
        a1: [entry("2026-05-01", "Outflow", -500)],
        a2: [entry("2026-05-01", "Also outflow", -500)],
      },
    });
    expect(out).toHaveLength(0);
  });

  it("rejects pairs of unequal magnitude", () => {
    const out = detectTransferCandidates({
      history: {
        a1: [entry("2026-05-01", "Transfer", -500)],
        a2: [entry("2026-05-01", "Transfer", 499)],
      },
    });
    expect(out).toHaveLength(0);
  });

  it("never pairs entries on the same account", () => {
    const out = detectTransferCandidates({
      history: {
        a1: [
          entry("2026-05-01", "Outflow", -500),
          entry("2026-05-01", "Inflow", 500),
        ],
      },
    });
    expect(out).toHaveLength(0);
  });

  it("skips entries already collapsed or hidden", () => {
    const out = detectTransferCandidates({
      history: {
        a1: [
          entry("2026-05-01", "Transfer", -500, {
            collapsedIntoTransferId: "tx1",
            hidden: true,
          }),
        ],
        a2: [entry("2026-05-01", "Transfer", 500)],
      },
    });
    expect(out).toHaveLength(0);
  });

  it("respects dismissed pair keys", () => {
    const a = entry("2026-05-01", "Transfer", -500);
    const b = entry("2026-05-01", "Transfer", 500);
    const pairKey = [a.id, b.id].sort().join("|");
    const out = detectTransferCandidates({
      history: { a1: [a], a2: [b] },
      dismissedPairKeys: new Set([pairKey]),
    });
    expect(out).toHaveLength(0);
  });

  it("doesn't reuse an entry across multiple candidate pairs", () => {
    // Three entries, two on a1 (one outflow, one inflow) and one
    // outflow on a2 matching the a1 inflow. Only the a1-a2 cross-
    // account pair should be emitted; the a1-internal pair is filtered
    // out by the same-account guard.
    const out = detectTransferCandidates({
      history: {
        a1: [
          entry("2026-05-01", "a1 out", -500),
          entry("2026-05-01", "a1 in", 500),
        ],
        a2: [entry("2026-05-01", "a2 out", -500)],
      },
    });
    // a2's outflow can match a1's inflow (cross-account, opposite
    // sign, same magnitude) — that's the single candidate.
    expect(out).toHaveLength(1);
    expect(out[0].fromAccountId).toBe("a2");
    expect(out[0].toAccountId).toBe("a1");
  });

  it("bumps confidence when both descriptions mention transfer keywords", () => {
    const noKw = detectTransferCandidates({
      history: {
        a1: [entry("2026-05-04", "Misc", -500)],
        a2: [entry("2026-05-04", "Misc", 500)],
      },
    });
    const withKw = detectTransferCandidates({
      history: {
        a1: [entry("2026-05-04", "Swish till sparkonto", -500)],
        a2: [entry("2026-05-04", "Swish från checking", 500)],
      },
    });
    expect(withKw[0].confidence).toBeGreaterThan(noKw[0].confidence);
  });
});
