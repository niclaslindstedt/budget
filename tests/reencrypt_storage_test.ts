import { describe, expect, it, vi } from "vitest";

import type {
  ReceiptOps,
  Snapshot,
  StorageAdapter,
} from "../src/storage/adapter";
import {
  extractPayslipPaths,
  extractReceiptPaths,
  reencryptStorage,
} from "../src/storage/reencrypt-storage";

// Receipts hang off transactions, so the snapshot models them as bank
// history entries (one synthetic account). `extractReceiptPaths` reads
// the same shape from budget rows too — see the dedicated test below.
function snapshotWith(paths: (string | undefined)[]): string {
  return JSON.stringify({
    history: {
      acct: paths.map((p, i) =>
        p === undefined ? { id: `${i}` } : { id: `${i}`, receiptPath: p },
      ),
    },
  });
}

// A fake adapter exposing only what `reencryptStorage` touches:
// `receipts` (an in-memory store) and `save`. The store doubles as the
// "what currently lives in this mode's backend" view so a rollback that
// writes back through `current` is observable.
function fakeAdapter(opts?: {
  uploadFails?: (path: string) => boolean;
  saveFails?: boolean;
  noReceipts?: boolean;
}) {
  const store = new Map<string, string>();
  const uploads: string[] = [];
  const removes: string[] = [];
  // Payslips ride the same parallel ops as receipts; give them their own
  // in-memory store so a payslip conversion is observable independently.
  const payslipStore = new Map<string, string>();
  const payslipUploads: string[] = [];
  function makeOps(s: Map<string, string>, up: string[]): ReceiptOps {
    return {
      async upload(path, blob) {
        if (opts?.uploadFails?.(path))
          throw new Error(`upload failed: ${path}`);
        up.push(path);
        s.set(path, await blob.text());
      },
      async download(path) {
        const text = s.get(path);
        return text === undefined ? null : new Blob([text]);
      },
      async remove(path) {
        removes.push(path);
        s.delete(path);
      },
    };
  }
  const receipts = makeOps(store, uploads);
  const payslips = makeOps(payslipStore, payslipUploads);
  const save = vi.fn(async (text: string): Promise<Snapshot> => {
    if (opts?.saveFails) throw new Error("save failed");
    return { text };
  });
  const adapter = {
    receipts: opts?.noReceipts ? undefined : receipts,
    payslips: opts?.noReceipts ? undefined : payslips,
    save,
  } as unknown as StorageAdapter;
  return {
    adapter,
    store,
    uploads,
    removes,
    save,
    payslipStore,
    payslipUploads,
  };
}

describe("extractReceiptPaths", () => {
  it("pulls receiptPath from each history entry, skipping absent ones", () => {
    expect(
      extractReceiptPaths(snapshotWith(["a.jpg", undefined, "b.pdf"])),
    ).toEqual(["a.jpg", "b.pdf"]);
  });
  it("pulls receiptPath from budget rows and de-dupes across sources", () => {
    const snapshot = JSON.stringify({
      history: { acct: [{ id: "1", receiptPath: "shared.jpg" }] },
      sheets: [
        {
          items: [
            {
              type: "accountBudget",
              rows: [
                { id: "r1", receiptPath: "row.pdf" },
                { id: "r2", receiptPath: "shared.jpg" },
                { id: "r3" },
              ],
            },
          ],
        },
      ],
    });
    expect(extractReceiptPaths(snapshot).sort()).toEqual([
      "row.pdf",
      "shared.jpg",
    ]);
  });
  it("tolerates malformed input", () => {
    expect(extractReceiptPaths("not json")).toEqual([]);
    expect(extractReceiptPaths(JSON.stringify({ history: "nope" }))).toEqual(
      [],
    );
    expect(extractReceiptPaths(JSON.stringify({ sheets: "nope" }))).toEqual([]);
    expect(extractReceiptPaths(JSON.stringify({}))).toEqual([]);
  });
});

describe("extractPayslipPaths", () => {
  it("pulls payslipPath from each salary, skipping absent ones", () => {
    const snapshot = JSON.stringify({
      salaries: [
        { id: "s1", payslipPath: "Acme - 2024-01.pdf" },
        { id: "s2" },
        { id: "s3", payslipPath: "Acme - 2024-02.pdf" },
      ],
    });
    expect(extractPayslipPaths(snapshot)).toEqual([
      "Acme - 2024-01.pdf",
      "Acme - 2024-02.pdf",
    ]);
  });
  it("tolerates malformed input", () => {
    expect(extractPayslipPaths("not json")).toEqual([]);
    expect(extractPayslipPaths(JSON.stringify({ salaries: "nope" }))).toEqual(
      [],
    );
    expect(extractPayslipPaths(JSON.stringify({}))).toEqual([]);
  });
});

describe("reencryptStorage — payslips", () => {
  it("converts receipts and payslips, then saves once", async () => {
    const snapshot = JSON.stringify({
      history: { acct: [{ id: "1", receiptPath: "r.jpg" }] },
      salaries: [{ id: "s1", payslipPath: "p.pdf" }],
    });
    const current = fakeAdapter();
    current.store.set("r.jpg", "plain:r");
    current.payslipStore.set("p.pdf", "plain:p");
    const target = fakeAdapter();

    await reencryptStorage(current.adapter, target.adapter, snapshot);

    expect(target.uploads).toEqual(["r.jpg"]);
    expect(target.payslipUploads).toEqual(["p.pdf"]);
    expect(target.payslipStore.get("p.pdf")).toBe("plain:p");
    expect(target.save).toHaveBeenCalledTimes(1);
  });
});

describe("reencryptStorage — happy path", () => {
  it("converts every receipt then saves the budget", async () => {
    const snapshot = snapshotWith(["a.jpg", "b.jpg"]);
    const current = fakeAdapter();
    // Seed the source store so `current.download` returns bytes.
    current.store.set("a.jpg", "plain:a");
    current.store.set("b.jpg", "plain:b");
    const target = fakeAdapter();

    await reencryptStorage(current.adapter, target.adapter, snapshot);

    expect(target.uploads.sort()).toEqual(["a.jpg", "b.jpg"]);
    expect(target.store.get("a.jpg")).toBe("plain:a");
    expect(target.save).toHaveBeenCalledTimes(1);
    expect(target.save).toHaveBeenCalledWith(snapshot);
  });

  it("skips items whose receipt file is missing", async () => {
    const snapshot = snapshotWith(["a.jpg", "gone.jpg"]);
    const current = fakeAdapter();
    current.store.set("a.jpg", "plain:a");
    // "gone.jpg" is absent from the source store → download returns null.
    const target = fakeAdapter();

    await reencryptStorage(current.adapter, target.adapter, snapshot);

    expect(target.uploads).toEqual(["a.jpg"]);
    expect(target.save).toHaveBeenCalledTimes(1);
  });
});

describe("reencryptStorage — atomic rollback", () => {
  it("rolls converted receipts back and does not save when one upload fails", async () => {
    const snapshot = snapshotWith(["a.jpg", "b.jpg"]);
    const current = fakeAdapter();
    current.store.set("a.jpg", "plain:a");
    current.store.set("b.jpg", "plain:b");
    const target = fakeAdapter({ uploadFails: (p) => p === "b.jpg" });

    await expect(
      reencryptStorage(current.adapter, target.adapter, snapshot),
    ).rejects.toThrow(/upload failed: b\.jpg/);

    // "a.jpg" converted, then "b.jpg" failed → "a.jpg" restored through
    // `current.upload`, and the budget is never saved.
    expect(current.uploads).toEqual(["a.jpg"]);
    expect(target.save).not.toHaveBeenCalled();
  });

  it("rolls every receipt back when the budget save fails", async () => {
    const snapshot = snapshotWith(["a.jpg", "b.jpg"]);
    const current = fakeAdapter();
    current.store.set("a.jpg", "plain:a");
    current.store.set("b.jpg", "plain:b");
    const target = fakeAdapter({ saveFails: true });

    await expect(
      reencryptStorage(current.adapter, target.adapter, snapshot),
    ).rejects.toThrow(/save failed/);

    // Both receipts converted, then save failed → both restored.
    expect(current.uploads.sort()).toEqual(["a.jpg", "b.jpg"]);
  });
});

describe("reencryptStorage — no receipts capability", () => {
  it("just saves the budget when either side lacks receipts", async () => {
    const snapshot = snapshotWith(["a.jpg"]);
    const current = fakeAdapter({ noReceipts: true });
    const target = fakeAdapter();
    await reencryptStorage(current.adapter, target.adapter, snapshot);
    expect(target.uploads).toEqual([]);
    expect(target.save).toHaveBeenCalledTimes(1);
  });
});
