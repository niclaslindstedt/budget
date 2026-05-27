// Shared description normaliser used by recurring-candidate detection
// (#1), merchant-hint auto-categorisation (#2), and transfer auto-
// collapse (#3). Same input → same key so a Spotify charge that's
// detected as recurring also memorises its category under the same
// key the next import looks up.
//
// The transform is intentionally lossy: case, punctuation, ISO/short
// dates, currency tokens, and long digit sequences (transaction
// reference numbers) all collapse to a single canonical form. The
// goal is "two charges with cosmetic differences map together" — not
// fingerprinting a unique merchant.

// Currency / amount tokens banks frequently glue onto descriptions.
// Stripped before digit-cleaning so "120,50 SEK" doesn't survive as a
// stray "sek". `\b` boundaries are used here because the tokens are
// ASCII; non-ASCII tokens use the explicit Unicode-aware boundary
// pattern in `NOISE_RE` below.
const CURRENCY_RE = /\b(sek|usd|eur|gbp|nok|dkk|chf|kr)\b/gi;

// Bank-statement noise tokens we don't want anchoring the key. Kept
// short and conservative — only words that show up on virtually every
// Swedish statement and convey no merchant identity. The pattern uses
// Unicode-aware lookarounds (rather than `\b`) so words containing
// Swedish letters (`ö`, `å`, `ä`) match cleanly at the start or end of
// a string — `\b` only fires between an ASCII word character and a
// non-word character, which would skip "Överföring" at position 0.
const NOISE_RE =
  /(?<![\p{L}\p{N}])(kortköp|kortkop|kkb|kkk|köp|kop|överföring|overforing|insättning|insattning|uttag|swish|betalning|autogiro|ref|notis|debit|credit|debet|kredit)(?![\p{L}\p{N}])/giu;

const ISO_DATE_RE = /\d{4}-\d{2}-\d{2}/g;
const SHORT_DATE_RE = /\d{1,2}[/.-]\d{1,2}(?:[/.-]\d{2,4})?/g;
// Sequences of 4+ digits look like reference numbers; sequences of 1-3
// digits sometimes carry meaning (a store number) but they're swept
// out by the punctuation collapse below as well.
const LONG_DIGITS_RE = /\d{4,}/g;
const PUNCT_RE = /[*#/\\,.;:|()[\]<>~+_-]+/g;
const WS_RE = /\s+/g;

// Memoize results by input string. Same bank description appears many
// times per import (every Spotify charge, every weekly salary) and
// `buildVisibleRows` re-resolves every history entry on every render
// that touches the active budget — without a cache, each render paid
// 7 regex replacements per entry. The transform is pure, so caching
// by input is sound. Bounded to keep memory predictable across long
// sessions; eviction is FIFO (Map preserves insertion order).
const CACHE_LIMIT = 4096;
const cache = new Map<string, string>();

export function normaliseDescription(input: string): string {
  const cached = cache.get(input);
  if (cached !== undefined) return cached;
  const result = input
    .toLowerCase()
    .replace(ISO_DATE_RE, " ")
    .replace(SHORT_DATE_RE, " ")
    .replace(CURRENCY_RE, " ")
    .replace(NOISE_RE, " ")
    .replace(LONG_DIGITS_RE, " ")
    .replace(PUNCT_RE, " ")
    .replace(WS_RE, " ")
    .trim();
  if (cache.size >= CACHE_LIMIT) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  cache.set(input, result);
  return result;
}

// True when the input collapses to a key that's too short to be a
// meaningful merchant identifier — used to skip detection on entries
// like "ATM" or "Fee" where false-positive grouping would dwarf the
// signal.
export function isNormalisedKeyMeaningful(key: string): boolean {
  return key.length >= 3;
}
