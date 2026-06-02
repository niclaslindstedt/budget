import { describe, expect, it } from "vitest";

import type {
  ReceiptOps,
  Snapshot,
  StorageAdapter,
} from "../src/storage/adapter";
import { withEncryption } from "../src/storage/encrypting-adapter";
import { isEncryptedEnvelope } from "../src/storage/crypto";

// Minimal inner adapter exposing an in-memory receipt store. The
// encrypting wrapper sits on top; the tests assert that receipts and
// payslips pass through unencrypted — only the budget JSON and backups
// ride the AES-GCM envelope.
function innerAdapter() {
  const store = new Map<string, Blob>();
  const payslipStore = new Map<string, Blob>();
  function makeOps(s: Map<string, Blob>): ReceiptOps {
    return {
      async upload(path, blob) {
        s.set(path, blob);
      },
      async download(path) {
        return s.get(path) ?? null;
      },
      async remove(path) {
        s.delete(path);
      },
    };
  }
  const adapter = {
    id: "folder",
    label: "fake",
    capabilities: new Set(["receipts", "payslips"]),
    receipts: makeOps(store),
    payslips: makeOps(payslipStore),
    async load(): Promise<Snapshot | null> {
      return null;
    },
    async save(text: string): Promise<Snapshot> {
      return { text };
    },
  } as unknown as StorageAdapter;
  return { adapter, store, payslipStore };
}

describe("encrypting adapter — receipts", () => {
  it("stores raw bytes and round-trips them even with a password held", async () => {
    const inner = innerAdapter();
    const wrapped = withEncryption(inner.adapter, { current: "hunter2" });

    const original = new Blob([new Uint8Array([1, 2, 3, 255, 0, 42])], {
      type: "image/png",
    });
    await wrapped.receipts!.upload("a.png", original);

    // On disk the bytes are the raw image, not an encrypted envelope.
    const stored = inner.store.get("a.png")!;
    expect(isEncryptedEnvelope(await stored.text())).toBe(false);
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 255, 0, 42]),
    );

    const back = await wrapped.receipts!.download("a.png");
    expect(back).not.toBeNull();
    expect(back!.type).toBe("image/png");
    expect(new Uint8Array(await back!.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 255, 0, 42]),
    );
  });

  it("writes raw bytes when no password is held", async () => {
    const inner = innerAdapter();
    const wrapped = withEncryption(inner.adapter, { current: null });
    const original = new Blob([new Uint8Array([7, 7])]);
    await wrapped.receipts!.upload("c.bin", original);
    const stored = inner.store.get("c.bin")!;
    expect(isEncryptedEnvelope(await stored.text())).toBe(false);
    expect(new Uint8Array(await stored.arrayBuffer())).toEqual(
      new Uint8Array([7, 7]),
    );
  });
});

describe("encrypting adapter — payslips", () => {
  it("stores payslips as raw bytes and round-trips them", async () => {
    const inner = innerAdapter();
    const wrapped = withEncryption(inner.adapter, { current: "hunter2" });

    const original = new Blob([new Uint8Array([5, 6, 7, 8])], {
      type: "application/pdf",
    });
    await wrapped.payslips!.upload("Acme - 2024-01.pdf", original);

    const stored = inner.payslipStore.get("Acme - 2024-01.pdf")!;
    expect(isEncryptedEnvelope(await stored.text())).toBe(false);

    const back = await wrapped.payslips!.download("Acme - 2024-01.pdf");
    expect(back!.type).toBe("application/pdf");
    expect(new Uint8Array(await back!.arrayBuffer())).toEqual(
      new Uint8Array([5, 6, 7, 8]),
    );
  });
});
