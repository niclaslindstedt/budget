// AES-GCM + PBKDF2 envelope used to encrypt the budget at rest.
// Pure helpers — no React, no localStorage. The envelope is itself a
// JSON object so an encrypted budget can share the same string-typed
// storage slot as the plaintext one; readers tell them apart by the
// `encrypted` discriminator.
//
// Defaults follow OWASP 2023 password-storage guidance: PBKDF2-SHA256
// at 600k iterations, AES-GCM with a 256-bit key, a fresh random salt
// per envelope, and a fresh 12-byte IV per encryption. The KDF
// parameters are stored on the envelope so future iteration bumps can
// be honored without breaking older blobs.

import { safeJsonParse } from "../utils/json";

const ENVELOPE_TAG = "budget.encrypted.v1" as const;
const DEFAULT_ITERATIONS = 600_000;
const KEY_LENGTH_BITS = 256;
const SALT_LENGTH_BYTES = 16;
const IV_LENGTH_BYTES = 12;

export type Envelope = {
  encrypted: typeof ENVELOPE_TAG;
  kdf: "PBKDF2";
  hash: "SHA-256";
  iterations: number;
  salt: string;
  iv: string;
  ciphertext: string;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

function fromBase64(value: string): Uint8Array {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function deriveKey(
  password: string,
  salt: BufferSource,
  iterations: number,
): Promise<CryptoKey> {
  const subtle = crypto.subtle;
  const passwordKey = await subtle.importKey(
    "raw",
    new TextEncoder().encode(password) as BufferSource,
    { name: "PBKDF2" },
    false,
    ["deriveKey"],
  );
  return subtle.deriveKey(
    { name: "PBKDF2", salt, iterations, hash: "SHA-256" },
    passwordKey,
    { name: "AES-GCM", length: KEY_LENGTH_BITS },
    false,
    ["encrypt", "decrypt"],
  );
}

function randomBytes(length: number): Uint8Array {
  const buf = new Uint8Array(length);
  crypto.getRandomValues(buf);
  return buf;
}

export async function encryptText(
  plaintext: string,
  password: string,
): Promise<string> {
  if (!password) throw new Error("Password is required");
  const salt = randomBytes(SALT_LENGTH_BYTES);
  const iv = randomBytes(IV_LENGTH_BYTES);
  const key = await deriveKey(
    password,
    salt as BufferSource,
    DEFAULT_ITERATIONS,
  );
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv as BufferSource },
    key,
    new TextEncoder().encode(plaintext) as BufferSource,
  );
  const envelope: Envelope = {
    encrypted: ENVELOPE_TAG,
    kdf: "PBKDF2",
    hash: "SHA-256",
    iterations: DEFAULT_ITERATIONS,
    salt: toBase64(salt),
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
  return JSON.stringify(envelope);
}

export async function decryptEnvelope(
  envelopeText: string,
  password: string,
): Promise<string> {
  const envelope = parseEnvelope(envelopeText);
  if (!envelope) throw new Error("Not an encrypted envelope");
  if (!password) throw new Error("Password is required");
  const salt = fromBase64(envelope.salt);
  const iv = fromBase64(envelope.iv);
  const ciphertext = fromBase64(envelope.ciphertext);
  const key = await deriveKey(
    password,
    salt as BufferSource,
    envelope.iterations,
  );
  let plaintext: ArrayBuffer;
  try {
    plaintext = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv as BufferSource },
      key,
      ciphertext as BufferSource,
    );
  } catch {
    // AES-GCM authentication failure — wrong password or tampered data.
    throw new Error("Wrong password");
  }
  return new TextDecoder().decode(plaintext);
}

export function parseEnvelope(text: string): Envelope | null {
  const parsed = safeJsonParse(text);
  if (
    typeof parsed === "object" &&
    parsed !== null &&
    (parsed as { encrypted?: unknown }).encrypted === ENVELOPE_TAG
  ) {
    return parsed as Envelope;
  }
  return null;
}

export function isEncryptedEnvelope(text: string): boolean {
  return parseEnvelope(text) !== null;
}
