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
//
// Every stripped region — a date, a ref, a card tail, AND any
// punctuation between merchant words — becomes a `*` wildcard rather
// than collapsing to a literal space. The pattern is matched against
// the *raw* bank text of lookalike entries (see `pattern-apply.ts`),
// and that raw text still carries the punctuation the deriver removed:
// a source line `HEMKOP VANERSBORG SU, VANERSBORG` must still match the
// lookalike `HEMKOP VANERSBORG SU, VANERSBORG` on a different date. A
// literal `SU VANERSBORG` (the comma collapsed to a space) would never
// match `SU, VANERSBORG`, so the comma's slot becomes a wildcard that
// spans whatever punctuation each raw line happens to carry there.

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

// Sentinel marking a stripped region. A unit-separator control char is
// convenient: it can't appear in a bank description, it isn't matched by
// `\s` (so the whitespace-collapse pass leaves it alone) and isn't a
// digit (so the digit-trim passes ignore it). It survives every
// intermediate pass and turns into a `*` wildcard only at the very end —
// substituting `*` up front would leave regex metacharacters in the
// string for the later passes to trip over. Built at runtime so the
// source file stays printable.
const GAP = String.fromCharCode(31);
// A gap together with the whitespace hugging it (and any adjacent gaps)
// collapses to one gap: a stripped region between two words leaves
// exactly one wildcard, not a literal space the raw text won't match.
const GAP_RUN_RE = new RegExp(`\\s*${GAP}[\\s${GAP}]*`, "g");
// Gaps that ended up at the very edges — the wrapping stars already
// cover a leading / trailing stripped region.
const EDGE_GAP_RE = new RegExp(`^${GAP}+|${GAP}+$`, "g");
const GAP_RE = new RegExp(GAP, "g");

export function derivePatternFromDescription(input: string): string {
  const trimmed = input.trim();
  if (trimmed === "") return "";

  let core = trimmed
    .replace(ISO_DATE_RE, GAP)
    .replace(DAY_DATE_RE, GAP)
    .replace(MONTH_RE, GAP)
    .replace(CARD_TAIL_RE, GAP)
    .replace(REF_LABEL_RE, GAP)
    .replace(HASH_REF_RE, GAP)
    .replace(LONG_DIGITS_RE, GAP)
    // Punctuation that commonly bookends date / ref fragments OR sits
    // between merchant words (the comma in "ICA NÄRA, ORT"). Leave
    // letters, short digit runs, and inner spacing alone so a token like
    // "ICA NÄRA" stays intact.
    .replace(/[#*xX\\/.,;:|]+/g, GAP)
    .replace(GAP_RUN_RE, GAP)
    .replace(/\s+/g, " ")
    .trim();

  // Strip leading / trailing pure-digit tokens that survived (short
  // runs the long-digits filter didn't catch, e.g. "Lunch 25" where
  // the 25 is an amount the bank stuffed into the description).
  core = core.replace(/^(?:\d+\s+)+/, "").replace(/(?:\s+\d+)+$/, "");
  core = core.replace(EDGE_GAP_RE, "");

  if (core === "") return `*${trimmed}*`;
  // Surviving gaps become wildcards; literal inter-word spaces stay
  // literal so a multi-word merchant ("ICA KVANTUM") matches verbatim.
  return `*${core.replace(GAP_RE, "*")}*`;
}
