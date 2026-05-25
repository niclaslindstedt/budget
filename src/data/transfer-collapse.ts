// Pure detector for cross-account transfers hiding in imported
// history. A Swish from Account A to Account B leaves a negative
// row in A's statement AND a positive row in B's statement; this
// module finds those mirror pairs so the user can collapse them into
// a single `Transfer` (and shelve both `HistoryEntry`s as hidden
// with a `collapsedIntoTransferId` backref).
//
// Pure: takes in entries (already merged into UserData.history) and a
// dismissal allowlist, emits a list of candidate pairs. The actual
// collapse / dismiss / undo lives in the reducer.

import { normaliseDescription } from "./description-normaliser";
import type { HistoryEntry } from "./types";

export type TransferCandidate = {
  // Stable pair id — concatenation of the two HistoryEntry ids in
  // sorted order. Used both for React keys and for the dismissal
  // allowlist so dismissals stick to the specific pair, not to either
  // entry on its own.
  pairKey: string;
  // The account losing money (the negative-side entry). The
  // resulting Transfer's `fromAccountId`.
  fromAccountId: string;
  fromEntry: HistoryEntry;
  // The account receiving money. The resulting Transfer's
  // `toAccountId`.
  toAccountId: string;
  toEntry: HistoryEntry;
  // ISO date for the resulting Transfer. The earlier of the two
  // statement dates so a 1-3 day clearing delay doesn't push the
  // transfer into the next fiscal month.
  date: string;
  // Always positive — the Transfer.amount convention.
  amount: number;
  // 0..1 score. Exact-day, keyword-laden pairs score highest; pairs
  // that need a 3-day window and no keyword overlap score around the
  // floor. The UI orders by this descending.
  confidence: number;
};

// True when at least one HistoryEntry across `history` is collapsed
// into the given transfer id (i.e. the transfer was minted by
// merging imported bank entries). The UI uses this to lock the
// fields the bank statement owns and expose an "is a transfer"
// toggle that demotes the pair back into stand-alone entries.
export function hasCollapsedHistory(
  history: Readonly<Record<string, readonly HistoryEntry[]>>,
  transferId: string,
): boolean {
  for (const entries of Object.values(history)) {
    for (const entry of entries) {
      if (entry.collapsedIntoTransferId === transferId) return true;
    }
  }
  return false;
}

export type TransferDetectInput = {
  // Imported history keyed by account id, as carried on `UserData`.
  history: Readonly<Record<string, readonly HistoryEntry[]>>;
  // Pair keys the user has previously dismissed with "Never". The
  // detector skips them so noise doesn't keep coming back.
  dismissedPairKeys?: ReadonlySet<string>;
  // Maximum |dateA - dateB| in days for a candidate to be considered.
  // Defaults to 3 per the brief.
  maxDateDeltaDays?: number;
};

// Keywords that bump confidence when present on either side of a
// candidate pair. Kept Swedish/English-leaning because that's the
// audience the parsers cover today; new languages slot in without
// changing the detector's shape.
const TRANSFER_KEYWORDS = [
  "swish",
  "överföring",
  "overforing",
  "transfer",
  "egen",
  "between accounts",
  "egen överf",
  "egen overf",
  "internal",
  "to own",
  "mellan konton",
];

export function detectTransferCandidates(
  input: TransferDetectInput,
): TransferCandidate[] {
  const dismissed = input.dismissedPairKeys ?? new Set<string>();
  const maxDelta = input.maxDateDeltaDays ?? 3;

  // Flatten { accountId → entries } into a single list tagged with
  // the owning accountId. Skip already-collapsed and already-hidden
  // entries because they carry no signal — the collapse is reversible
  // by un-hiding them and clearing the backref.
  type Tagged = { accountId: string; entry: HistoryEntry };
  const tagged: Tagged[] = [];
  for (const [accountId, entries] of Object.entries(input.history)) {
    for (const entry of entries) {
      if (entry.collapsedIntoTransferId) continue;
      if (entry.hidden) continue;
      tagged.push({ accountId, entry });
    }
  }

  // Index by amount magnitude so the O(N²) pair walk only ever touches
  // entries that share an absolute value. Rounded to two decimals so
  // 100.00 and 100.0 are the same bucket; the import path also
  // rounds, so the keys agree.
  const byAbsAmount = new Map<string, Tagged[]>();
  for (const t of tagged) {
    const key = roundedAbs(t.entry.amount).toFixed(2);
    const list = byAbsAmount.get(key);
    if (list) list.push(t);
    else byAbsAmount.set(key, [t]);
  }

  const out: TransferCandidate[] = [];
  const usedEntryIds = new Set<string>();

  for (const bucket of byAbsAmount.values()) {
    if (bucket.length < 2) continue;
    // Sort by date so we always pair the closest matches first; a
    // pair already locked in won't be re-used by a later, weaker
    // match.
    const sorted = [...bucket].sort((a, b) =>
      a.entry.date < b.entry.date ? -1 : a.entry.date > b.entry.date ? 1 : 0,
    );
    for (let i = 0; i < sorted.length; i++) {
      const a = sorted[i];
      if (usedEntryIds.has(a.entry.id)) continue;
      for (let j = i + 1; j < sorted.length; j++) {
        const b = sorted[j];
        if (usedEntryIds.has(b.entry.id)) continue;
        if (a.accountId === b.accountId) continue;
        if (!signsOppose(a.entry.amount, b.entry.amount)) continue;
        const delta = absDayDiff(a.entry.date, b.entry.date);
        if (delta > maxDelta) {
          // The bucket is sorted by date; once the delta exceeds the
          // window for one `j`, every later `j` is at least as far,
          // so we can stop early.
          break;
        }
        const pair = makeCandidate(a, b, delta);
        if (dismissed.has(pair.pairKey)) continue;
        out.push(pair);
        usedEntryIds.add(a.entry.id);
        usedEntryIds.add(b.entry.id);
        break;
      }
    }
  }

  out.sort((p, q) => q.confidence - p.confidence);
  return out;
}

function makeCandidate(
  a: { accountId: string; entry: HistoryEntry },
  b: { accountId: string; entry: HistoryEntry },
  dayDelta: number,
): TransferCandidate {
  // The negative-side entry is the "from"; positive-side is the "to".
  const aNegative = a.entry.amount < 0;
  const from = aNegative ? a : b;
  const to = aNegative ? b : a;
  const pairKey = [a.entry.id, b.entry.id].sort().join("|");
  // Date stamp on the resulting Transfer: the earlier of the two
  // so the transfer appears in the same fiscal month a user would
  // expect (the receiving bank often clears a day later).
  const date =
    from.entry.date < to.entry.date ? from.entry.date : to.entry.date;
  const amount = roundedAbs(from.entry.amount);
  const confidence = scoreConfidence(from.entry, to.entry, dayDelta);
  return {
    pairKey,
    fromAccountId: from.accountId,
    fromEntry: from.entry,
    toAccountId: to.accountId,
    toEntry: to.entry,
    date,
    amount,
    confidence,
  };
}

function scoreConfidence(
  from: HistoryEntry,
  to: HistoryEntry,
  dayDelta: number,
): number {
  // Day-proximity: same day → 1.0, three days apart → 0.4. A clean
  // linear ramp keeps the scoring predictable.
  const dayScore = Math.max(0, 1 - dayDelta / 4);

  // Keyword bonus: either side mentioning Swish / Överföring / etc.
  // adds confidence; both sides mentioning bumps higher still. The
  // keyword check runs against the lowercased raw description (NOT
  // the normalised key) because the normaliser's noise list strips
  // exactly these tokens to keep merchant identity clean — fine for
  // the bucketing #2 cares about, wrong for #3's "this is a transfer"
  // signal.
  const fromLower = from.description.toLowerCase();
  const toLower = to.description.toLowerCase();
  const fromHasKw = hasTransferKeyword(fromLower);
  const toHasKw = hasTransferKeyword(toLower);
  let kwBonus = 0;
  if (fromHasKw && toHasKw) kwBonus = 0.25;
  else if (fromHasKw || toHasKw) kwBonus = 0.15;

  // Descriptions that normalise to the same key (e.g. both rows say
  // "Överföring till sparkonto") are nearly certainly a transfer.
  // Using the normalised forms here lets cosmetic differences like
  // case and date prefixes still collapse to one key.
  const fromKey = normaliseDescription(from.description);
  const toKey = normaliseDescription(to.description);
  const sameKey = fromKey === toKey && fromKey.length > 0 ? 0.1 : 0;

  return Math.min(1, dayScore * 0.65 + kwBonus + sameKey);
}

function hasTransferKeyword(lower: string): boolean {
  return TRANSFER_KEYWORDS.some((kw) => lower.includes(kw));
}

function signsOppose(a: number, b: number): boolean {
  return (a > 0 && b < 0) || (a < 0 && b > 0);
}

function roundedAbs(n: number): number {
  return Math.round(Math.abs(n) * 100) / 100;
}

function absDayDiff(a: string, b: string): number {
  const da = parseIso(a);
  const db = parseIso(b);
  if (da === null || db === null) return Number.POSITIVE_INFINITY;
  return Math.abs(Math.round((da - db) / 86_400_000));
}

function parseIso(iso: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}/.test(iso)) return null;
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) {
    return null;
  }
  return Date.UTC(y, m - 1, d);
}
