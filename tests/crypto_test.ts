import { describe, expect, it } from "vitest";

import {
  decryptEnvelope,
  encryptText,
  isEncryptedEnvelope,
  parseEnvelope,
} from "../src/storage/crypto";

describe("encryptText / decryptEnvelope", () => {
  it("round-trips a UTF-8 plaintext", async () => {
    const plain =
      '{"version":3,"sheets":[],"activeSheetId":"x","categories":[]}';
    const envelope = await encryptText(plain, "correct horse battery staple");
    const back = await decryptEnvelope(
      envelope,
      "correct horse battery staple",
    );
    expect(back).toBe(plain);
  });

  it("round-trips non-ASCII text", async () => {
    const plain = "räntor — 1 234,56 kr · 🔐";
    const envelope = await encryptText(plain, "förälskelse-2026!");
    const back = await decryptEnvelope(envelope, "förälskelse-2026!");
    expect(back).toBe(plain);
  });

  it("produces a different ciphertext each call (random salt + iv)", async () => {
    const a = await encryptText("hello", "pw");
    const b = await encryptText("hello", "pw");
    expect(a).not.toBe(b);
    // Both decrypt correctly with the same password.
    expect(await decryptEnvelope(a, "pw")).toBe("hello");
    expect(await decryptEnvelope(b, "pw")).toBe("hello");
  });

  it("rejects a wrong password", async () => {
    const envelope = await encryptText("secret", "right");
    await expect(decryptEnvelope(envelope, "wrong")).rejects.toThrow(
      /Wrong password/,
    );
  });

  it("rejects tampered ciphertext", async () => {
    const envelope = await encryptText("payload", "pw");
    const parsed = JSON.parse(envelope);
    // Flip a base64 digit in the ciphertext — AES-GCM's auth tag catches
    // this and refuses to decrypt.
    parsed.ciphertext =
      parsed.ciphertext.slice(0, -2) +
      (parsed.ciphertext.slice(-2) === "AA" ? "BB" : "AA");
    await expect(decryptEnvelope(JSON.stringify(parsed), "pw")).rejects.toThrow(
      /Wrong password/,
    );
  });

  it("rejects empty password on encrypt", async () => {
    await expect(encryptText("x", "")).rejects.toThrow(/Password is required/);
  });
});

describe("isEncryptedEnvelope / parseEnvelope", () => {
  it("recognizes a freshly produced envelope", async () => {
    const envelope = await encryptText("hi", "pw");
    expect(isEncryptedEnvelope(envelope)).toBe(true);
    const parsed = parseEnvelope(envelope);
    expect(parsed).not.toBeNull();
    expect(parsed?.encrypted).toBe("budget.encrypted.v1");
    expect(parsed?.kdf).toBe("PBKDF2");
    expect(parsed?.hash).toBe("SHA-256");
    expect(parsed?.iterations).toBeGreaterThanOrEqual(600_000);
  });

  it("rejects plain budget JSON as not-an-envelope", () => {
    const plain = JSON.stringify({
      version: 3,
      sheets: [],
      activeSheetId: "x",
      categories: [],
    });
    expect(isEncryptedEnvelope(plain)).toBe(false);
    expect(parseEnvelope(plain)).toBeNull();
  });

  it("rejects malformed JSON", () => {
    expect(isEncryptedEnvelope("{not json")).toBe(false);
    expect(parseEnvelope("{not json")).toBeNull();
  });

  it("rejects an object missing the discriminator", () => {
    expect(isEncryptedEnvelope(JSON.stringify({ foo: "bar" }))).toBe(false);
  });

  it("rejects an object with a foreign discriminator", () => {
    expect(
      isEncryptedEnvelope(JSON.stringify({ encrypted: "other.format.v1" })),
    ).toBe(false);
  });
});
