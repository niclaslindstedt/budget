// Gzip envelope for the budget bytes at rest / in transit. Pure
// helpers — no React, no localStorage. The budget JSON is highly
// repetitive (keyed records, repeated field names, ISO dates) and
// compresses to ~15–30% of its plaintext size, so wrapping the
// persistence byte boundary in gzip is the single cheapest way to make
// every cloud sync upload (and every localStorage / IndexedDB write)
// smaller. See `compressing-adapter.ts` for the `StorageAdapter`
// wrapper that drives these.
//
// Storage slots hold strings, not binary, so the gzipped bytes are
// base64-encoded and tagged with a textual prefix. Plaintext budget
// JSON and the AES-GCM envelope both start with `{`, so a leading
// `COMPRESSION_PREFIX` is an unambiguous discriminator: any string that
// carries it is compressed, anything else is passed through untouched.
// That keeps the format backward-compatible — a budget written before
// compression landed loads unchanged, and the first save re-writes it
// compressed.

// Versioned so a future codec swap (brotli, raw deflate) can be told
// apart from this one. Bump the suffix, never reuse it.
const COMPRESSION_PREFIX = "budget.gz1:";

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

async function gzip(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([input as BlobPart])
    .stream()
    .pipeThrough(new CompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

async function gunzip(input: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([input as BlobPart])
    .stream()
    .pipeThrough(new DecompressionStream("gzip"));
  const buf = await new Response(stream).arrayBuffer();
  return new Uint8Array(buf);
}

// Compress `plaintext` into the tagged, base64 gzip envelope.
export async function compressText(plaintext: string): Promise<string> {
  const bytes = new TextEncoder().encode(plaintext);
  const gz = await gzip(bytes);
  return COMPRESSION_PREFIX + toBase64(gz);
}

// Inverse of `compressText`. Throws on malformed / truncated input the
// same way `DecompressionStream` does — the caller treats a throw the
// way it treats a decryption failure.
export async function decompressText(text: string): Promise<string> {
  if (!isCompressed(text)) {
    throw new Error("Not a compressed envelope");
  }
  const gz = fromBase64(text.slice(COMPRESSION_PREFIX.length));
  const bytes = await gunzip(gz);
  return new TextDecoder().decode(bytes);
}

export function isCompressed(text: string): boolean {
  return text.startsWith(COMPRESSION_PREFIX);
}
