// Derive a glob pattern seed from a row's raw description so the
// "Label similar" modal lands on a pattern that matches *more than just
// this exact row*. Bank exports and manually-typed descriptions usually
// follow the shape `<merchant-token> <date> <ref>` (or the same parts
// in another order), where only the merchant token is stable across
// related entries — dates, card-tail digits, and reference numbers vary
// per transaction and would otherwise pin the pattern to a single row.
//
// The output is a glob pattern (`*` matches any run, see
// `match-rules.ts:compilePattern`). When stripping leaves the core
// empty (description was nothing but dates + numbers) we fall back to
// wrapping the trimmed original so the modal still seeds something the
// user can sharpen by hand.

// Months in English + Swedish, short and long forms. Matched at a word
// boundary in `stripDates` so substrings inside merchant names (e.g.
// "MAJOR" containing "MAJ") aren't false-positives.
const MONTH_TOKENS = [
  "jan",
  "january",
  "januari",
  "feb",
  "february",
  "februari",
  "mar",
  "march",
  "mars",
  "apr",
  "april",
  "may",
  "maj",
  "jun",
  "june",
  "juni",
  "jul",
  "july",
  "juli",
  "aug",
  "august",
  "augusti",
  "sep",
  "sept",
  "september",
  "oct",
  "october",
  "okt",
  "oktober",
  "nov",
  "november",
  "dec",
  "december",
];

const MONTH_RE = new RegExp(
  String.raw`\b(?:${MONTH_TOKENS.join("|")})\b`,
  "gi",
);

// ISO dates (`2024-05-12`, `2024/05/12`, `2024.05.12`) and
// day-first dates with 2- or 4-digit years (`12/05`, `12/05/24`,
// `12-05-2024`, `12.05`). Year-first is allowed to omit the day,
// day-first requires at least dd/mm.
const ISO_DATE_RE = /\b\d{4}[-/.]\d{1,2}(?:[-/.]\d{1,2})?\b/g;
const DAY_DATE_RE = /\b\d{1,2}[-/.]\d{1,2}(?:[-/.]\d{2,4})?\b/g;

// Card-tail markers: `*1234`, `**1234`, `****1234`, `XXXX1234`.
const CARD_TAIL_RE = /[*xX]{2,}\s?\d{2,}/g;

// Reference / receipt markers: `#1234`, `Ref: 1234`, `RefNr 1234`,
// `Verifikat 1234`, plain trailing/leading numeric runs of 4+ digits.
const REF_LABEL_RE =
  /\b(?:ref(?:erence|nr|nummer)?|verifikat|kvitto|kid|ocr|fakturanr?)[:\s#]*\d+\b/gi;
const HASH_REF_RE = /#\s*\d+\b/g;
const LONG_DIGITS_RE = /\b\d{4,}\b/g;

export function derivePatternFromDescription(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";

  let core = trimmed
    .replace(ISO_DATE_RE, " ")
    .replace(DAY_DATE_RE, " ")
    .replace(MONTH_RE, " ")
    .replace(CARD_TAIL_RE, " ")
    .replace(REF_LABEL_RE, " ")
    .replace(HASH_REF_RE, " ")
    .replace(LONG_DIGITS_RE, " ")
    // Strip leftover punctuation that commonly bookends date / ref
    // fragments. Leave letters, digits ≤ 3 long, and inner spacing
    // alone so a token like "ICA NÄRA" stays intact.
    .replace(/[#*xX\\/.,;:|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Strip leading / trailing pure-digit tokens that survived (short
  // runs the long-digits filter didn't catch, e.g. "Lunch 25" where
  // the 25 is an amount the bank stuffed into the description).
  core = core.replace(/^(?:\d+\s+)+/, "").replace(/(?:\s+\d+)+$/, "");

  if (core === "") return `*${trimmed}*`;
  return `*${core}*`;
}
