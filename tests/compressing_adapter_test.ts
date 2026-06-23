import { describe, expect, it } from "vitest";

import {
  ConflictError,
  type Snapshot,
  type StorageAdapter,
} from "../src/storage/adapter";
import { withCompression } from "../src/storage/compressing-adapter";
import { compressText, isCompressed } from "../src/storage/compression";
import { withEncryption } from "../src/storage/encrypting-adapter";
import { isEncryptedEnvelope } from "../src/storage/crypto";

// In-memory backend that holds whatever bytes were last written, so a
// `withCompression` round-trip can be observed end-to-end. `stored`
// exposes the raw on-disk bytes for asserting on the wire format.
function memoryAdapter(initial: string | null = null): {
  adapter: StorageAdapter;
  stored: () => string | null;
} {
  let bytes: string | null = initial;
  return {
    adapter: {
      id: "browser",
      label: "Memory",
      capabilities: new Set(),
      async load(): Promise<Snapshot | null> {
        return bytes === null ? null : { text: bytes, revision: "r1" };
      },
      async save(text: string): Promise<Snapshot> {
        bytes = text;
        return { text, revision: "r2" };
      },
    },
    stored: () => bytes,
  };
}

describe("withCompression", () => {
  it("stores gzip-tagged bytes and hands plaintext back to the caller", async () => {
    const { adapter: inner, stored } = memoryAdapter();
    const adapter = withCompression(inner);
    const plain = JSON.stringify({ version: 79, sheets: [] });

    const written = await adapter.save(plain);
    // Caller sees plaintext; the backend holds compressed bytes.
    expect(written.text).toBe(plain);
    expect(isCompressed(stored()!)).toBe(true);

    const loaded = await adapter.load();
    expect(loaded?.text).toBe(plain);
    expect(loaded?.revision).toBe("r1");
  });

  it("passes legacy uncompressed bytes through on load", async () => {
    // A budget written before compression landed sits as plaintext on
    // disk; load must hand it back untouched so the first save can
    // re-write it compressed.
    const legacy = JSON.stringify({ version: 79, sheets: [] });
    const { adapter: inner } = memoryAdapter(legacy);
    const adapter = withCompression(inner);

    const loaded = await adapter.load();
    expect(loaded?.text).toBe(legacy);
  });

  it("returns null when the inner backend is empty", async () => {
    const { adapter: inner } = memoryAdapter(null);
    const adapter = withCompression(inner);
    expect(await adapter.load()).toBeNull();
  });

  it("drops the loadSync capability (decompression is async)", () => {
    const { adapter: inner } = memoryAdapter();
    const withCaps: StorageAdapter = {
      ...inner,
      capabilities: new Set(["loadSync", "watch"]),
    };
    const adapter = withCompression(withCaps);
    expect(adapter.capabilities.has("loadSync")).toBe(false);
    expect(adapter.capabilities.has("watch")).toBe(true);
  });

  it("composes outside encryption: compress then encrypt round-trips", async () => {
    const { adapter: inner, stored } = memoryAdapter();
    const passwordRef = { current: "correct horse battery staple" };
    // Same composition order as the live adapter:
    // withCompression(withEncryption(inner)).
    const adapter = withCompression(withEncryption(inner, passwordRef));
    const plain = JSON.stringify({ version: 79, history: { a: [1, 2, 3] } });

    await adapter.save(plain);
    // On-disk bytes are an encryption envelope (encrypt-of-gzip), not a
    // bare gzip blob — proving compression ran before encryption.
    expect(isEncryptedEnvelope(stored()!)).toBe(true);
    expect(isCompressed(stored()!)).toBe(false);

    const loaded = await adapter.load();
    expect(loaded?.text).toBe(plain);
  });

  it("decompresses both sides of a ConflictError thrown from save", async () => {
    // The inner adapter (cloud mirror) re-reads the remote on a 409 and
    // throws a ConflictError carrying *compressed* bytes for both sides.
    // Without decompressing them here the conflict modal parses gzip as
    // JSON, fails, and shows a fresh empty budget ("0 entries").
    const remotePlain = JSON.stringify({ version: 80, sheets: ["remote"] });
    const localPlain = JSON.stringify({ version: 80, sheets: ["local"] });
    const remoteBytes = await compressText(remotePlain);
    const localBytes = await compressText(localPlain);

    const inner: StorageAdapter = {
      id: "dropbox",
      label: "Conflicting",
      capabilities: new Set(),
      async load(): Promise<Snapshot | null> {
        return null;
      },
      async save(): Promise<Snapshot> {
        throw new ConflictError(
          { text: remoteBytes, revision: "remote-rev" },
          { text: localBytes, revision: "local-rev" },
        );
      },
    };
    const adapter = withCompression(inner);

    await expect(adapter.save(localPlain)).rejects.toMatchObject({
      name: "ConflictError",
      remote: { text: remotePlain, revision: "remote-rev" },
      local: { text: localPlain, revision: "local-rev" },
    });
  });

  it("decompresses a ConflictError thrown from load", async () => {
    const remotePlain = JSON.stringify({ version: 80, sheets: ["remote"] });
    const localPlain = JSON.stringify({ version: 80, sheets: ["local"] });
    const remoteBytes = await compressText(remotePlain);
    const localBytes = await compressText(localPlain);

    const inner: StorageAdapter = {
      id: "dropbox",
      label: "Conflicting",
      capabilities: new Set(),
      async load(): Promise<Snapshot | null> {
        throw new ConflictError(
          { text: remoteBytes, revision: "remote-rev" },
          { text: localBytes, revision: "local-rev" },
        );
      },
      async save(text: string): Promise<Snapshot> {
        return { text, revision: "r2" };
      },
    };
    const adapter = withCompression(inner);

    await expect(adapter.load()).rejects.toMatchObject({
      name: "ConflictError",
      remote: { text: remotePlain },
      local: { text: localPlain },
    });
  });

  it("forwards sibling-file ops untouched", () => {
    const { adapter: inner } = memoryAdapter();
    const backups = {
      list: async () => [],
      create: async () => {},
      read: async () => "",
      remove: async () => {},
    };
    const adapter = withCompression({ ...inner, backups });
    // Backups stay self-contained full-blob artifacts — never compressed.
    expect(adapter.backups).toBe(backups);
  });
});
