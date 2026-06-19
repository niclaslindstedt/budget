import { describe, expect, it } from "vitest";

import {
  compressText,
  decompressText,
  isCompressed,
} from "../src/storage/compression";

describe("compressText / decompressText", () => {
  it("round-trips a UTF-8 plaintext", async () => {
    const plain =
      '{"version":79,"sheets":[],"activeSheetId":"x","categories":[]}';
    const compressed = await compressText(plain);
    expect(await decompressText(compressed)).toBe(plain);
  });

  it("round-trips non-ASCII text", async () => {
    const plain = "räntor — 1 234,56 kr · 🔐 löneförhöjning";
    const compressed = await compressText(plain);
    expect(await decompressText(compressed)).toBe(plain);
  });

  it("round-trips a large repetitive payload smaller than the original", async () => {
    // Budget JSON is highly repetitive (repeated field names, ISO
    // dates, keyed records) — the whole reason gzip pays off.
    const row = '{"date":"2026-06-19","description":"ICA","amount":-123.45},';
    const plain = `{"history":{"acct1":[${row.repeat(2000)}]}}`;
    const compressed = await compressText(plain);
    expect(await decompressText(compressed)).toBe(plain);
    // Far smaller than plaintext even after the base64 inflation.
    expect(compressed.length).toBeLessThan(plain.length / 2);
  });

  it("tags compressed output with the versioned prefix", async () => {
    const compressed = await compressText("hello");
    expect(compressed.startsWith("budget.gz1:")).toBe(true);
    expect(isCompressed(compressed)).toBe(true);
  });

  it("does not recognize plaintext budget JSON as compressed", () => {
    const plain = JSON.stringify({ version: 79, sheets: [] });
    expect(isCompressed(plain)).toBe(false);
  });

  it("does not recognize an encryption envelope as compressed", () => {
    // An envelope starts with `{`, never the gzip prefix.
    const envelope = JSON.stringify({ encrypted: "budget.encrypted.v1" });
    expect(isCompressed(envelope)).toBe(false);
  });

  it("rejects decompressing non-compressed input", async () => {
    await expect(decompressText('{"version":79}')).rejects.toThrow(
      /Not a compressed envelope/,
    );
  });

  it("rejects truncated / corrupt gzip bytes", async () => {
    const compressed = await compressText("payload that compresses fine");
    // Lop off the tail of the base64 body — the gzip stream can no
    // longer be inflated.
    const truncated = compressed.slice(0, compressed.length - 8);
    await expect(decompressText(truncated)).rejects.toThrow();
  });
});
