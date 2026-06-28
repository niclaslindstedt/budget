// Cross-account duplicate finder for imported bank history. Scans every
// account's `UserData.history[accountId]` and groups transactions that
// appear in TWO OR MORE different accounts with the same date, the same
// normalised bank description, the same signed amount, AND the same
// running balance — the signature of "I imported the wrong bank
// statement into this account".
//
// Balance is part of the signature, not just a tie-breaker: a genuine
// mis-import copies the statement row verbatim, balance included, so the
// two copies carry an IDENTICAL balance. A mere coincidence — the same
// merchant charging the same amount on the same day to two different
// accounts (a recurring card payment) — lands each account on its own
// running total, so the balances differ and the pair is NOT flagged.
// That single extra field is what stops the finder drowning the user in
// false positives. Entries that carry no balance (some credit-card
// exports omit it) bucket together under a "no balance" sentinel, so two
// balance-less copies still match each other; the per-charge ignore list
// (`UserData.duplicateIgnores`) mops up whatever coincidences slip
// through that gap.
//
// Sibling of `src/data/budget/conflicts.ts`, but the two solve
// different problems and must not be conflated:
//
//   - **Conflicts** (budget page) live WITHIN one account and pair a
//     bank-history row with a parallel user-authored row so the user can
//     merge them. Two real bank rows are never a conflict there.
//   - **Duplicates** (here, accounts page) span DIFFERENT accounts and
//     are ALWAYS bank history on both sides. One copy is the genuine
//     transaction; the others are mis-imports the user wants removed.
//
// Resolution: the user picks which account OWNS each duplicate; the
// matching entries in every other account are deleted (the owner keeps
// its copy). The finder suggests the most likely owner using balance
// continuity — see `suggestOwner` — so the common case is one click of
// "accept all".
//
// Pure: no React, no storage. Consumed by `AccountDuplicatesModal` in
// `src/components/accounts/`.

import {
  isNormalisedKeyMeaningful,
  normaliseDescription,
} from "../description-normaliser";
import type { DuplicateIgnore, HistoryEntry, UserData } from "../types";

// Balance figures are stored in major units (kr) with decimals, so all
// continuity comparisons happen in integer minor units (öre) to keep
// floating-point drift from opening or closing the match band. One öre
// of slack absorbs rounding in bank exports.
const BALANCE_TOLERANCE_CENTS = 1;

function cents(n: number): number {
  return Math.round(n * 100);
}

// The balance segment of a duplicate signature: the running balance in
// öre, or the literal "nb" ("no balance") when the export carried none.
// Two entries only share a signature when their balances match exactly —
// no rounding tolerance applies here, because a true mis-import copies the
// balance byte-for-byte, and two unrelated accounts landing on the very
// same balance after the same-amount transaction on the same day is
// vanishingly unlikely. That makes the balance the strongest part of the
// signature.
function balanceSig(entry: HistoryEntry): string {
  return typeof entry.balance === "number" && Number.isFinite(entry.balance)
    ? String(cents(entry.balance))
    : "nb";
}

// Lookup key for the "not a duplicate" ignore list: EXACT raw bank
// description (not the lossy normalised key the groups are built from)
// plus the signed amount in öre. Exact so silencing one recurring charge
// can't accidentally suppress a different transaction that merely
// normalises to the same merchant.
function ignoreKey(description: string, amount: number): string {
  return `${description}|${cents(amount)}`;
}

function buildIgnoreSet(
  ignores: readonly DuplicateIgnore[] | undefined,
): Set<string> {
  const set = new Set<string>();
  for (const rule of ignores ?? []) {
    set.add(ignoreKey(rule.description, rule.amount));
  }
  return set;
}

// One account's stake in a duplicate group: every entry it holds that
// matches the group's signature, plus whether at least one of them
// reconciles against the account's own balance chain.
export type DuplicateAccount = {
  accountId: string;
  // All entries in this account carrying the group's signature. Usually
  // one; more than one only when the same account genuinely posted the
  // transaction twice on the same day (rare). All of them are deleted
  // together when another account is chosen as owner.
  entries: HistoryEntry[];
  // Does at least one of this account's matching entries have a real
  // predecessor here — an entry whose balance plus this one's amount
  // equals this one's balance? `true` ⇒ the running total flows into it,
  // so the transaction genuinely belongs here. `false` ⇒ it lands on a
  // pre-balance no entry in this account ever held — the stray
  // mis-import. `null` ⇒ no balance on the entry to judge by. Drives both
  // the `suggestOwner` pre-selection and the red balance flag in the
  // expanded context panel.
  fits: boolean | null;
};

export type DuplicateGroup = {
  // Stable signature-derived id: `${date}|${normKey}|${amountCents}`.
  id: string;
  date: string;
  // Representative raw bank description (the most common spelling across
  // the matching entries) for display.
  description: string;
  amount: number;
  // The accounts that hold this transaction — always two or more.
  accounts: DuplicateAccount[];
  // The account the finder thinks genuinely owns the transaction. The
  // modal pre-selects it; the user can override per group.
  suggestedOwnerId: string;
};

type AccountIndex = {
  // Every post-transaction balance (öre) the account records. An entry
  // "fits" here when its pre-balance (`balance - amount`) is itself a
  // balance in this set — i.e. some entry in the same account is its
  // immediate statement predecessor, with the running total flowing
  // cleanly into it (`predecessor.balance + entry.amount == entry.balance`).
  // A transaction mis-imported into the wrong account lands on a
  // pre-balance no entry there ever held, so it doesn't fit and is flagged
  // as the stray copy. Deliberately a single backward step, NOT a walk of
  // the whole chain: a real statement's balances are continuous, so the
  // one-step check is both sufficient and robust to whatever order the
  // entries were imported in.
  balances: Set<number>;
  // Total non-collapsed entries — a weak tie-breaker for the owner
  // suggestion (a fuller statement is marginally more likely the home).
  total: number;
  // Count of entries per ISO date — denser days point at the real
  // statement when the balance check can't decide.
  byDate: Map<string, number>;
};

// A transfer leg auto-collapsed into a `Transfer` is intentionally
// mirrored on two accounts and must never be deleted as a "duplicate" —
// removing it would strand its partner leg. Such entries are excluded
// from candidacy entirely.
function isCandidate(entry: HistoryEntry): boolean {
  return entry.collapsedIntoTransferId === undefined && entry.amount !== 0;
}

function buildAccountIndex(entries: readonly HistoryEntry[]): AccountIndex {
  const byDate = new Map<string, number>();
  const balances = new Set<number>();
  let total = 0;
  for (const entry of entries) {
    if (!isCandidate(entry)) continue;
    total += 1;
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + 1);
    if (typeof entry.balance === "number" && Number.isFinite(entry.balance)) {
      balances.add(cents(entry.balance));
    }
  }
  return { balances, total, byDate };
}

// Does the running total flow cleanly into this entry on this account —
// i.e. is its pre-balance (`balance - amount`) one the account actually
// records, so a real predecessor hands off to it? `true` when a
// predecessor balance exists, `false` when the entry lands on a balance
// no entry there ever held (the stray mis-import), `null` when the entry
// carried no balance to judge by. One backward step, not a whole-chain
// walk: a statement's balances are continuous, so the immediate
// predecessor is all the signal needed and the check doesn't depend on
// import order or on the history being gap-free.
function entryFits(entry: HistoryEntry, idx: AccountIndex): boolean | null {
  if (typeof entry.balance !== "number" || !Number.isFinite(entry.balance)) {
    return null;
  }
  const pre = cents(entry.balance) - cents(entry.amount);
  for (let d = -BALANCE_TOLERANCE_CENTS; d <= BALANCE_TOLERANCE_CENTS; d += 1) {
    if (idx.balances.has(pre + d)) return true;
  }
  return false;
}

// Roll the per-entry verdict up to the account: `true` if any matching
// entry reconciles, `null` if none carried a balance to judge, else
// `false`.
function accountFits(
  entries: readonly HistoryEntry[],
  idx: AccountIndex,
): boolean | null {
  let sawFalse = false;
  for (const entry of entries) {
    const fit = entryFits(entry, idx);
    if (fit === true) return true;
    if (fit === false) sawFalse = true;
  }
  return sawFalse ? false : null;
}

// Pick the account most likely to own a duplicate. Exported so the modal
// can re-suggest after the account set changes and tests can pin the
// heuristic. Ordering, strongest signal first:
//
//   1. Balance reconciles here (`fits === true`) — a real predecessor in
//      this account hands the running total off to the transaction. The
//      mis-imported copy lands on a pre-balance no entry there ever held,
//      so this is the decisive tell.
//   2. More entries on the transaction's own date — the genuine
//      statement clusters that day's activity; a stray import is alone.
//   3. Fuller history overall.
//   4. Lowest accountId, purely so the result is deterministic.
export function suggestOwner(
  accounts: readonly DuplicateAccount[],
  date: string,
  indexByAccount: Map<string, AccountIndex>,
): string {
  return [...accounts].sort((a, b) => {
    const fa = a.fits === true ? 1 : 0;
    const fb = b.fits === true ? 1 : 0;
    if (fa !== fb) return fb - fa;
    const ia = indexByAccount.get(a.accountId);
    const ib = indexByAccount.get(b.accountId);
    const da = ia?.byDate.get(date) ?? 0;
    const db = ib?.byDate.get(date) ?? 0;
    if (da !== db) return db - da;
    const ta = ia?.total ?? 0;
    const tb = ib?.total ?? 0;
    if (ta !== tb) return tb - ta;
    return a.accountId.localeCompare(b.accountId);
  })[0].accountId;
}

// The most common spelling of a description across a set of entries, so
// a one-off cosmetic variant doesn't become the group label. Ties go to
// the first seen.
function representativeDescription(entries: readonly HistoryEntry[]): string {
  const counts = new Map<string, number>();
  let best = entries[0]?.description ?? "";
  let bestCount = 0;
  for (const e of entries) {
    const c = (counts.get(e.description) ?? 0) + 1;
    counts.set(e.description, c);
    if (c > bestCount) {
      bestCount = c;
      best = e.description;
    }
  }
  return best;
}

type Bucket = {
  date: string;
  amount: number;
  // entries grouped by the account that holds them
  byAccount: Map<string, HistoryEntry[]>;
};

// Find cross-account duplicate groups. Only accounts in `data.accounts`
// are scanned (savings share the history id-space but the user imports
// statements per bank account, so they're out of scope here). Returns
// groups newest-first; empty when nothing spans two accounts.
export function findDuplicateImports(data: UserData): DuplicateGroup[] {
  const accountIds = new Set(data.accounts.map((a) => a.id));
  const indexByAccount = new Map<string, AccountIndex>();
  const buckets = new Map<string, Bucket>();
  const ignored = buildIgnoreSet(data.duplicateIgnores);

  for (const account of data.accounts) {
    const entries = data.history[account.id];
    if (!entries || entries.length === 0) continue;
    indexByAccount.set(account.id, buildAccountIndex(entries));
    for (const entry of entries) {
      if (!isCandidate(entry)) continue;
      // Ignored entries are skipped here (never grouped) but stay in the
      // index above so they keep counting toward the balance set.
      if (ignored.has(ignoreKey(entry.description, entry.amount))) continue;
      if (typeof entry.date !== "string" || entry.date.length < 10) continue;
      const key = normaliseDescription(entry.description);
      if (!isNormalisedKeyMeaningful(key)) continue;
      const sig = `${entry.date}|${key}|${cents(entry.amount)}|${balanceSig(entry)}`;
      let bucket = buckets.get(sig);
      if (!bucket) {
        bucket = {
          date: entry.date,
          amount: entry.amount,
          byAccount: new Map(),
        };
        buckets.set(sig, bucket);
      }
      const list = bucket.byAccount.get(account.id);
      if (list) list.push(entry);
      else bucket.byAccount.set(account.id, [entry]);
    }
  }

  const out: DuplicateGroup[] = [];
  for (const [sig, bucket] of buckets) {
    if (bucket.byAccount.size < 2) continue;
    const accounts: DuplicateAccount[] = [];
    for (const [accountId, entries] of bucket.byAccount) {
      if (!accountIds.has(accountId)) continue;
      const idx = indexByAccount.get(accountId);
      accounts.push({
        accountId,
        entries,
        fits: idx ? accountFits(entries, idx) : null,
      });
    }
    if (accounts.length < 2) continue;
    out.push({
      id: sig,
      date: bucket.date,
      description: representativeDescription(
        accounts.flatMap((a) => a.entries),
      ),
      amount: bucket.amount,
      accounts,
      suggestedOwnerId: suggestOwner(accounts, bucket.date, indexByAccount),
    });
  }

  out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return out;
}

// The {accountId, entryId} pairs to delete when `ownerAccountId` is
// chosen as the owner of `group`: every matching entry in every account
// except the owner. Returns an empty list when the owner isn't part of
// the group (defensive) — callers treat that as "no-op / keep all".
export function duplicateRemovals(
  group: DuplicateGroup,
  ownerAccountId: string,
): { accountId: string; entryId: string }[] {
  if (!group.accounts.some((a) => a.accountId === ownerAccountId)) return [];
  const out: { accountId: string; entryId: string }[] = [];
  for (const acc of group.accounts) {
    if (acc.accountId === ownerAccountId) continue;
    for (const entry of acc.entries) {
      out.push({ accountId: acc.accountId, entryId: entry.id });
    }
  }
  return out;
}

// The {description, amount} ignore rules to add when the user marks a
// group "not a duplicate": one per DISTINCT raw bank description across
// the group's entries (they all share the amount). Storing every spelling
// — not just the representative — means a future import of the same
// charge is suppressed whichever variant the bank writes that month.
export function ignoreRulesForGroup(group: DuplicateGroup): DuplicateIgnore[] {
  const seen = new Set<string>();
  const out: DuplicateIgnore[] = [];
  for (const acc of group.accounts) {
    for (const entry of acc.entries) {
      if (seen.has(entry.description)) continue;
      seen.add(entry.description);
      out.push({ description: entry.description, amount: group.amount });
    }
  }
  return out;
}

// The statement neighbours of `targetId` within one account's history:
// the entry immediately before and after it, so the user can eyeball
// whether the matched transaction's balance fits between them (it does
// on the account that genuinely owns it; a foreign mis-import leaves a
// visible jump). Ordered by date, then by original import order as a
// stable tie-break — for a single imported statement that array order IS
// the bank's own order, so same-day entries keep their statement
// sequence. Returns the target plus up to one neighbour on each side;
// `null` neighbours mean the target is at an edge of the history.
export type HistoryContext = {
  before: HistoryEntry | null;
  target: HistoryEntry;
  after: HistoryEntry | null;
};

export function historyContext(
  entries: readonly HistoryEntry[],
  targetId: string,
): HistoryContext | null {
  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) =>
      a.entry.date < b.entry.date
        ? -1
        : a.entry.date > b.entry.date
          ? 1
          : a.index - b.index,
    );
  const pos = ordered.findIndex((o) => o.entry.id === targetId);
  if (pos === -1) return null;
  return {
    before: pos > 0 ? ordered[pos - 1].entry : null,
    target: ordered[pos].entry,
    after: pos < ordered.length - 1 ? ordered[pos + 1].entry : null,
  };
}
