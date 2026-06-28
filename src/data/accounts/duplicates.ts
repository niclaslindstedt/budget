// Cross-account duplicate finder for imported bank history. Scans every
// account's `UserData.history[accountId]` and groups transactions that
// appear in TWO OR MORE different accounts with the same date, the same
// normalised bank description, and the same signed amount — the
// signature of "I imported the wrong bank statement into this account".
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
import type { HistoryEntry, UserData } from "../types";

// Balance figures are stored in major units (kr) with decimals, so all
// continuity comparisons happen in integer minor units (öre) to keep
// floating-point drift from opening or closing the match band. One öre
// of slack absorbs rounding in bank exports.
const BALANCE_TOLERANCE_CENTS = 1;

function cents(n: number): number {
  return Math.round(n * 100);
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
  // Does at least one of this account's matching entries sit on the
  // account's reconstructed running-balance chain? `true` ⇒ the entry's
  // balance is reachable by walking the chain forward from the opening
  // balance, so the transaction genuinely belongs here. `false` ⇒ its
  // balance is unreachable — a foreign block injected by a mis-import
  // sits off to the side of the native chain. `null` ⇒ no balance on the
  // entry to judge by. Not shown in the UI; consumed only by
  // `suggestOwner` to pick the pre-selected owner.
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
  // Post-transaction balances (öre) reachable by walking the running
  // balance forward from the opening balance through this account's own
  // entries — its native statement chain. A candidate entry "fits" when
  // its recorded balance lands in here. A mis-imported block is
  // internally self-consistent but does NOT connect to this chain, so
  // its balances stay out of the set — that's what distinguishes the
  // genuine copy from the stray one. See `buildReachableBalances`.
  reachable: Set<number>;
  // Total non-collapsed entries — a weak tie-breaker for the owner
  // suggestion (a fuller statement is marginally more likely the home).
  total: number;
  // Count of entries per ISO date — denser days point at the real
  // statement when balance continuity can't decide.
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
  let openingCents: number | null = null;
  let earliest: string | undefined;
  let total = 0;
  for (const entry of entries) {
    if (!isCandidate(entry)) continue;
    total += 1;
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + 1);
    if (typeof entry.balance === "number" && Number.isFinite(entry.balance)) {
      // The opening balance is the earliest entry's balance minus its
      // amount — the balance just before the first known transaction.
      if (earliest === undefined || entry.date < earliest) {
        earliest = entry.date;
        openingCents = cents(entry.balance) - cents(entry.amount);
      }
    }
  }
  return {
    reachable: buildReachableBalances(entries, openingCents),
    total,
    byDate,
  };
}

// Reconstruct the account's running-balance chain and return the set of
// post-balances (öre) it reaches. Bank statements are logically ordered:
// each transaction's balance equals the previous balance plus its signed
// amount. So starting from the opening balance we repeatedly follow the
// running total to the next entry whose pre-balance (`balance - amount`)
// matches it, collecting every balance the chain lands on.
//
// This is the discriminating step. A statement mis-imported into the
// wrong account forms a self-consistent block — its entries chain to
// each OTHER perfectly — but it does not connect to the host account's
// opening balance, so the walk never reaches it and its balances stay
// out of the set. (The earlier "is this pre-balance present anywhere in
// the account?" test could not tell the two apart: a foreign block
// reconciles against itself, so almost everything looked like it fit.)
function buildReachableBalances(
  entries: readonly HistoryEntry[],
  openingCents: number | null,
): Set<number> {
  const reachable = new Set<number>();
  if (openingCents === null) return reachable;
  // Map each entry's pre-balance (öre) to the post-balances of every
  // entry that picks up from it. A list, not a single value, because
  // pathological data can post two entries from the same pre-balance;
  // entries are consumed as the walk visits them so the loop can't cycle.
  const byPre = new Map<number, number[]>();
  let count = 0;
  for (const entry of entries) {
    if (!isCandidate(entry)) continue;
    if (typeof entry.balance !== "number" || !Number.isFinite(entry.balance)) {
      continue;
    }
    count += 1;
    const pre = cents(entry.balance) - cents(entry.amount);
    const post = cents(entry.balance);
    const list = byPre.get(pre);
    if (list) list.push(post);
    else byPre.set(pre, [post]);
  }
  let running = openingCents;
  for (let step = 0; step < count; step += 1) {
    const post = takeReachable(byPre, running);
    if (post === undefined) break;
    reachable.add(post);
    running = post;
  }
  return reachable;
}

// Pop one entry whose pre-balance matches `running` (within the rounding
// tolerance) from the pre-balance map, returning its post-balance. The
// matched entry is removed so a shared balance isn't walked twice.
function takeReachable(
  byPre: Map<number, number[]>,
  running: number,
): number | undefined {
  for (let d = -BALANCE_TOLERANCE_CENTS; d <= BALANCE_TOLERANCE_CENTS; d += 1) {
    const list = byPre.get(running + d);
    if (list && list.length > 0) {
      const post = list.shift() as number;
      if (list.length === 0) byPre.delete(running + d);
      return post;
    }
  }
  return undefined;
}

// Does this entry sit on its account's reconstructed running-balance
// chain? `true` when its recorded balance is one the chain reaches (see
// `buildReachableBalances`), `false` when it's unreachable (the foreign
// block of a mis-import), `null` when the entry carried no balance.
function entryFits(entry: HistoryEntry, idx: AccountIndex): boolean | null {
  if (typeof entry.balance !== "number" || !Number.isFinite(entry.balance)) {
    return null;
  }
  const balance = cents(entry.balance);
  for (let d = -BALANCE_TOLERANCE_CENTS; d <= BALANCE_TOLERANCE_CENTS; d += 1) {
    if (idx.reachable.has(balance + d)) return true;
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
//   1. Balance reconciles here (`fits === true`) — the transaction sits
//      on a balance the account's own chain explains. The mis-imported
//      copy lands on an unexplained jump, so this is the decisive tell.
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

  for (const account of data.accounts) {
    const entries = data.history[account.id];
    if (!entries || entries.length === 0) continue;
    indexByAccount.set(account.id, buildAccountIndex(entries));
    for (const entry of entries) {
      if (!isCandidate(entry)) continue;
      if (typeof entry.date !== "string" || entry.date.length < 10) continue;
      const key = normaliseDescription(entry.description);
      if (!isNormalisedKeyMeaningful(key)) continue;
      const sig = `${entry.date}|${key}|${cents(entry.amount)}`;
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
