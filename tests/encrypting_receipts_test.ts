import { describe, expect, it } from "vitest";

import type {
  ReceiptOps,
  Snapshot,
  StorageAdapter,
} from "../src/storage/adapter";
import { withEncryption } from "../src/storage/encrypting-adapter";
import { isEncryptedEnvelope } from "../src/storage/crypto";

// Minimal inner adapter exposing an in-memory receipt store. The
// encrypting wrapper sits on top; the tests assert what lands in the
// inner store (ciphertext vs raw) and what the wrapper hands back.
function innerAdapter() {
  const store = new Map<string, Blob>();
  const receipts: ReceiptOps = {
    async upload(path, blob) {
      store.set(path, blob);
    },
    async download(path) {
      return store.get(path) ?? null;
    },
    async remove(path) {
      store.delete(path);
    },
  };
  const adapter = {
    id: "folder",
    label: "fake",
    capabilities: new Set(["receipts"]),
    receipts,
    async load(): Promise<Snapshot | null> {
      return null;
    },
    async save(text: string): Promise<Snapshot> {
      return { text };
    },
  } as unknown as StorageAdapter;
  return { adapter, store };
}

describe("encrypting adapter — receipts", () => {
  it("stores ciphertext and round-trips the original bytes + type", async () => {
    const inner = innerAdapter();
    const wrapped = withEncryption(inner.adapter, { current: "hunter2" });

    const original = new Blob([new Uint8Array([1, 2, 3, 255, 0, 42])], {
      type: "image/png",
    });
    await wrapped.receipts!.upload("a.png", original);

    // On disk the bytes are an encrypted envelope, not the raw image.
    const stored = inner.store.get("a.png")!;
    expect(isEncryptedEnvelope(await stored.text())).toBe(true);

    const back = await wrapped.receipts!.download("a.png");
    expect(back).not.toBeNull();
    expect(back!.type).toBe("image/png");
    expect(new Uint8Array(await back!.arrayBuffer())).toEqual(
      new Uint8Array([1, 2, 3, 255, 0, 42]),
    );
  });

  it("passes a raw (pre-encryption) receipt through on download untouched", async () => {
    const inner = innerAdapter();
    // Simulate a receipt written while encryption was off.
    inner.store.set(
      "b.pdf",
      new Blob([new Uint8Array([9, 9, 9])], { type: "application/pdf" }),
    );
    const wrapped = withEncryption(inner.adapter, { current: "hunter2" });
    const back = await wrapped.receipts!.download("b.pdf");
    expect(new Uint8Array(await back!.arrayBuffer())).toEqual(
      new Uint8Array([9, 9, 9]),
    );
  });

  it("writes plaintext when no password is held", async () => {
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
