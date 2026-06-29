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
  // Does at least one of this account's matching entries reconcile against
  // the account's genuine chain — i.e. does the last NON-duplicate entry
  // before it, carried forward across any intervening mis-imported
  // duplicates, hand the running total off to it? `true` ⇒ the genuine
  // chain flows into it, so the transaction belongs here. `false` ⇒ it
  // lands on a balance the account's own history never produced — the
  // stray mis-import. `null` ⇒ no balance (or no genuine anchor) to judge
  // by. Drives both the `suggestOwner` pre-selection and the green / red
  // balance pill in the expanded context panel. See `AccountIndex.fitById`
  // for why the anchor is the last non-duplicate, not the immediate row.
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
  // Per-entry continuity verdict, keyed by entry id: does the running total
  // flow cleanly from the last NON-duplicate entry before it into this
  // entry — i.e. does
  //   anchor.balance + Σ(amounts of the duplicates between anchor and entry,
  //                       this entry included) == entry.balance ?
  //   - `true`  — the genuine row before the (possibly multi-row)
  //               mis-import block chains in: the transaction belongs here.
  //   - `false` — it does NOT add up: the entry lands on a balance the
  //               account's own history never produced — a mis-import.
  //   - `null`  — nothing to judge by (no balance, or no non-duplicate
  //               entry precedes it to anchor on).
  //
  // The anchor is the last NON-duplicate entry, NOT the immediate
  // predecessor. A whole statement mis-imported into the wrong account is a
  // contiguous block of duplicates that chains into ITSELF (each row's
  // balance was copied verbatim from the real statement), so checking the
  // immediate predecessor falsely validates every duplicate after the
  // first. Anchoring on the last genuine row — and summing the skipped
  // duplicates' amounts across the gap — is the only thing that tells the
  // owner (where the genuine chain flows into the block) from the
  // mis-import (where it doesn't). It is also NOT membership in the set of
  // every balance the account ever held: over months of history a wrong
  // account coincidentally holds the pre-balance at some unrelated point,
  // so the set test painted every copy green and let ownership fall to the
  // tie-breakers. The chain is ordered exactly like `historyContext` (date
  // asc, then original import order). Auto-collapsed transfer legs, hidden
  // rows, and zero-amount notices stay in the chain because they all move
  // (or hold) the running total — and a non-duplicate one is a valid
  // anchor (a salary deposit / internal transfer that got collapsed into a
  // `Transfer` is frequently the genuine owner's predecessor).
  fitById: Map<string, boolean | null>;
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

function hasBalance(
  entry: HistoryEntry,
): entry is HistoryEntry & { balance: number } {
  return typeof entry.balance === "number" && Number.isFinite(entry.balance);
}

function buildAccountIndex(
  entries: readonly HistoryEntry[],
  duplicateIds: ReadonlySet<string>,
): AccountIndex {
  // Order the WHOLE running-balance chain by date, then original import
  // order — identical to `historyContext`, so a copy's verdict here lines
  // up with the before/target/after the user sees in the context panel.
  const ordered = entries
    .map((entry, index) => ({ entry, index }))
    .sort((a, b) =>
      a.entry.date < b.entry.date
        ? -1
        : a.entry.date > b.entry.date
          ? 1
          : a.index - b.index,
    );
  const byDate = new Map<string, number>();
  const fitById = new Map<string, boolean | null>();
  let total = 0;
  // Single forward pass tracking the last NON-duplicate balance as the
  // anchor, plus the signed sum of every duplicate amount seen since it.
  // A duplicate's verdict is then `anchor + sumSinceAnchor + amount ==
  // balance` — the genuine row's balance carried forward across the whole
  // mis-import block, not the block's own internally-consistent chain.
  let anchorBalance: number | null = null;
  let sumSinceAnchor = 0;
  for (let i = 0; i < ordered.length; i += 1) {
    const entry = ordered[i].entry;
    if (duplicateIds.has(entry.id)) {
      if (!hasBalance(entry) || anchorBalance === null) {
        fitById.set(entry.id, null);
      } else {
        const expected = anchorBalance + sumSinceAnchor + cents(entry.amount);
        fitById.set(
          entry.id,
          Math.abs(expected - cents(entry.balance)) <= BALANCE_TOLERANCE_CENTS,
        );
      }
      // Carry this duplicate's amount forward so the next duplicate in the
      // same block is measured from the same genuine anchor.
      sumSinceAnchor += cents(entry.amount);
    } else if (hasBalance(entry)) {
      // A genuine row: it becomes the new anchor and resets the run.
      anchorBalance = cents(entry.balance);
      sumSinceAnchor = 0;
    }
    // Density tie-breakers count only real, non-collapsed statement
    // activity — a collapsed transfer leg or zero-amount notice is part of
    // the balance chain but isn't evidence of which account owns the day.
    if (!isCandidate(entry)) continue;
    total += 1;
    byDate.set(entry.date, (byDate.get(entry.date) ?? 0) + 1);
  }
  return { fitById, total, byDate };
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
    const fit = idx.fitById.get(entry.id) ?? null;
    if (fit === true) return true;
    if (fit === false) sawFalse = true;
  }
  return sawFalse ? false : null;
}

// Pick the account most likely to own a duplicate. Exported so the modal
// can re-suggest after the account set changes and tests can pin the
// heuristic. Ordering, strongest signal first:
//
//   1. Balance reconciles here (`fits === true`) — the account's last
//      genuine row hands the running total off to the transaction. The
//      mis-imported copy lands on a balance the account's own history never
//      produced, so this is the decisive tell.
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
  const buckets = new Map<string, Bucket>();
  const ignored = buildIgnoreSet(data.duplicateIgnores);

  // Pass 1 — bucket every candidate entry by its cross-account signature
  // (date + normalised description + signed amount + running balance).
  for (const account of data.accounts) {
    const entries = data.history[account.id];
    if (!entries || entries.length === 0) continue;
    for (const entry of entries) {
      if (!isCandidate(entry)) continue;
      // Ignored entries are never grouped, but they stay genuine on the
      // chain (a legitimate recurring charge posting to two accounts), so
      // the continuity walk below still anchors on them.
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

  // The set of entries that ARE duplicates — those whose signature bucket
  // spans two or more accounts. The continuity walk anchors on entries
  // OUTSIDE this set (the account's genuine rows), so a contiguous block of
  // mis-imported duplicates cannot validate itself off its own copied
  // balances.
  const duplicateIds = new Set<string>();
  for (const bucket of buckets.values()) {
    if (bucket.byAccount.size < 2) continue;
    for (const list of bucket.byAccount.values()) {
      for (const entry of list) duplicateIds.add(entry.id);
    }
  }

  // Pass 2 — build per-account continuity indexes now that the duplicate
  // set is known.
  const indexByAccount = new Map<string, AccountIndex>();
  for (const account of data.accounts) {
    const entries = data.history[account.id];
    if (!entries || entries.length === 0) continue;
    indexByAccount.set(account.id, buildAccountIndex(entries, duplicateIds));
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

// One candidate owner for a BATCH of duplicate groups (every cross-account
// duplicate one import created), used by the import-time single-owner
// picker: the account, how many of the groups it appears in, and in how
// many its copy's balance reconciles. Drives both the option list and the
// default suggestion.
export type BatchOwnerOption = {
  accountId: string;
  // Groups this account is a member of (holds a copy in).
  groupCount: number;
  // Of those, how many reconcile here (`fits === true`).
  fitCount: number;
};

// The accounts a batch of duplicate groups involves, with per-account fit
// tallies — the option set for "which account owns all of these?".
export function duplicateBatchOwners(
  groups: readonly DuplicateGroup[],
): BatchOwnerOption[] {
  const byId = new Map<string, BatchOwnerOption>();
  for (const group of groups) {
    for (const acc of group.accounts) {
      let opt = byId.get(acc.accountId);
      if (!opt) {
        opt = { accountId: acc.accountId, groupCount: 0, fitCount: 0 };
        byId.set(acc.accountId, opt);
      }
      opt.groupCount += 1;
      if (acc.fits === true) opt.fitCount += 1;
    }
  }
  return [...byId.values()];
}

// The single owner to pre-select for a batch: the account whose copies
// reconcile in the most groups (tie-break: more groups, then lowest id).
// `null` when no account's balance reconciles anywhere — the picker then
// defaults to Skip, mirroring the per-group rule.
export function suggestBatchOwner(
  groups: readonly DuplicateGroup[],
): string | null {
  let best: BatchOwnerOption | null = null;
  for (const opt of duplicateBatchOwners(groups)) {
    if (opt.fitCount === 0) continue;
    if (
      best === null ||
      opt.fitCount > best.fitCount ||
      (opt.fitCount === best.fitCount && opt.groupCount > best.groupCount) ||
      (opt.fitCount === best.fitCount &&
        opt.groupCount === best.groupCount &&
        opt.accountId.localeCompare(best.accountId) < 0)
    ) {
      best = opt;
    }
  }
  return best ? best.accountId : null;
}

// Every {accountId, entryId} to delete to consolidate a BATCH of groups to
// one owner: the union of each group's `duplicateRemovals`, de-duplicated.
// Groups the owner isn't a member of contribute nothing (their copies are
// left for a later pass).
export function duplicateBatchRemovals(
  groups: readonly DuplicateGroup[],
  ownerAccountId: string,
): { accountId: string; entryId: string }[] {
  const seen = new Set<string>();
  const out: { accountId: string; entryId: string }[] = [];
  for (const group of groups) {
    for (const removal of duplicateRemovals(group, ownerAccountId)) {
      const key = `${removal.accountId}|${removal.entryId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(removal);
    }
  }
  return out;
}

// User-authored overlay fields carried from a removed duplicate copy onto
// the surviving owner copy, so time spent categorising a transaction on the
// wrong account isn't wasted when it's consolidated. Fill-blanks only — a
// field already set on the owner is never overwritten. `hidden` is left out
// on purpose: it's display state (shelving / transfer collapse), not
// categorisation, and migrating it could silently hide the owner's row.
const MIGRATABLE_FIELDS = [
  "userDescription",
  "userTypeId",
  "userCompanyId",
  "userTagIds",
  "userSeriesId",
  "splits",
  "lineItems",
  "receiptPath",
  "fiscalMonthShift",
  "isTransfer",
  "ignored",
  "hintIgnored",
  "noCompany",
] as const;

function copyBlankField<K extends keyof HistoryEntry>(
  patch: Partial<HistoryEntry>,
  owner: HistoryEntry,
  sources: readonly HistoryEntry[],
  field: K,
): void {
  if (owner[field] !== undefined) return;
  for (const src of sources) {
    if (src[field] !== undefined) {
      patch[field] = src[field];
      return;
    }
  }
}

// The fill-blanks patch to apply to `owner` from `sources` — every
// migratable field the owner lacks but a removed copy carries. Empty when
// the owner already has everything (or the sources carry nothing).
export function migrateMetadata(
  owner: HistoryEntry,
  sources: readonly HistoryEntry[],
): Partial<HistoryEntry> {
  const patch: Partial<HistoryEntry> = {};
  for (const field of MIGRATABLE_FIELDS) {
    copyBlankField(patch, owner, sources, field);
  }
  return patch;
}

// The metadata patches to apply when `group` resolves to `ownerAccountId`:
// for each surviving owner copy, the fill-blanks overlay drawn from the
// copies in every OTHER account (which are about to be deleted). Empty when
// the owner already carries everything or nothing is being removed.
export function duplicateMetadataMigrations(
  group: DuplicateGroup,
  ownerAccountId: string,
): { accountId: string; entryId: string; patch: Partial<HistoryEntry> }[] {
  const owner = group.accounts.find((a) => a.accountId === ownerAccountId);
  if (!owner) return [];
  const sources = group.accounts
    .filter((a) => a.accountId !== ownerAccountId)
    .flatMap((a) => a.entries);
  if (sources.length === 0) return [];
  const out: {
    accountId: string;
    entryId: string;
    patch: Partial<HistoryEntry>;
  }[] = [];
  for (const ownerEntry of owner.entries) {
    const patch = migrateMetadata(ownerEntry, sources);
    if (Object.keys(patch).length > 0) {
      out.push({ accountId: ownerAccountId, entryId: ownerEntry.id, patch });
    }
  }
  return out;
}

// Batch version of `duplicateMetadataMigrations` over many groups resolving
// to the same owner — the import-time single-owner picker's path.
export function duplicateBatchMetadataMigrations(
  groups: readonly DuplicateGroup[],
  ownerAccountId: string,
): { accountId: string; entryId: string; patch: Partial<HistoryEntry> }[] {
  return groups.flatMap((g) => duplicateMetadataMigrations(g, ownerAccountId));
}

// The strongest owner signal for an import that created cross-account
// duplicates. A bank statement is the COMPLETE record of one account over
// its date range, so the true owner is the account whose history within
// that range is EXACTLY the duplicated rows — it holds a copy in every
// group (100% of the conflicts) and carries no other statement row in the
// window. An account that holds those rows ALONGSIDE other history in the
// same range can't be the owner (its real statement would list the extras
// too), so its copies are foreign mis-imports. Returns that account's id,
// or `null` when none qualifies or more than one does (e.g. a fresh import
// target and a dedicated copy are indistinguishable) — ownership then
// falls back to the balance heuristic. `history` is the POST-import world.
export function exclusiveRangeOwner(
  groups: readonly DuplicateGroup[],
  history: Record<string, readonly HistoryEntry[]>,
  rangeStart: string,
  rangeEnd: string,
): string | null {
  if (groups.length === 0) return null;
  // Conflict entry ids per account + the set of accounts the groups touch.
  const conflictIds = new Map<string, Set<string>>();
  const groupCount = new Map<string, number>();
  for (const group of groups) {
    for (const acc of group.accounts) {
      groupCount.set(acc.accountId, (groupCount.get(acc.accountId) ?? 0) + 1);
      let ids = conflictIds.get(acc.accountId);
      if (!ids) {
        ids = new Set<string>();
        conflictIds.set(acc.accountId, ids);
      }
      for (const entry of acc.entries) ids.add(entry.id);
    }
  }
  const candidates: string[] = [];
  for (const [accountId, count] of groupCount) {
    // Must hold a copy in every group — 100% of the conflicts.
    if (count !== groups.length) continue;
    const ids = conflictIds.get(accountId) ?? new Set<string>();
    // ...and no other statement row in the import's date range.
    const hasOther = (history[accountId] ?? []).some(
      (entry) =>
        isCandidate(entry) &&
        entry.date >= rangeStart &&
        entry.date <= rangeEnd &&
        !ids.has(entry.id),
    );
    if (!hasOther) candidates.push(accountId);
  }
  return candidates.length === 1 ? candidates[0] : null;
}

// One non-owner account's import session that a duplicate resolution can
// expand into: the session id, how many of its entries are the group's
// own matched copies, and how many MORE entries that session left in the
// account. Surfaced so the modal can offer "remove the rest of that
// import (N more)" — when a statement is imported into the wrong account,
// every row from that session is a mis-import, not just the colliding one.
export type DuplicateSession = {
  accountId: string;
  importId: string;
  // Entries this account holds carrying `importId` (the whole session).
  total: number;
  // How many of those are the group's matched copies (always >= 1).
  matched: number;
};

// The import sessions a resolution would expand into when `ownerAccountId`
// is kept: for every OTHER account in the group whose matched copies carry
// an `importId`, the session(s) those copies belong to — but only when the
// session left MORE entries in the account than the group itself matched
// (`total > matched`), since that surplus is what "remove the rest of that
// import" actually removes. Returns an empty list when nothing expands
// (no `importId` on the copies, or the matched copies are the whole
// session), so the modal can hide the affordance.
export function duplicateSessions(
  group: DuplicateGroup,
  ownerAccountId: string,
  history: Record<string, readonly HistoryEntry[]>,
): DuplicateSession[] {
  const out: DuplicateSession[] = [];
  for (const acc of group.accounts) {
    if (acc.accountId === ownerAccountId) continue;
    // Count this account's matched copies per import session.
    const matchedBySession = new Map<string, number>();
    for (const entry of acc.entries) {
      if (entry.importId === undefined) continue;
      matchedBySession.set(
        entry.importId,
        (matchedBySession.get(entry.importId) ?? 0) + 1,
      );
    }
    if (matchedBySession.size === 0) continue;
    const entries = history[acc.accountId] ?? [];
    for (const [importId, matched] of matchedBySession) {
      let total = 0;
      for (const e of entries) if (e.importId === importId) total += 1;
      if (total > matched) {
        out.push({ accountId: acc.accountId, importId, total, matched });
      }
    }
  }
  return out;
}

// Like `duplicateRemovals`, but every removed copy drags the rest of its
// import session with it: for each non-owner account, instead of dropping
// only the matched entries, drop every entry that shares their `importId`.
// This is the "the whole statement went into the wrong account" path — one
// mis-import means the entire session is wrong. Matched copies that carry
// no `importId` (pre-`importId` imports, hand-built fixtures) fall back to
// removing just themselves, so the result is never narrower than
// `duplicateRemovals`. Owner copies are always kept.
export function duplicateSessionRemovals(
  group: DuplicateGroup,
  ownerAccountId: string,
  history: Record<string, readonly HistoryEntry[]>,
): { accountId: string; entryId: string }[] {
  if (!group.accounts.some((a) => a.accountId === ownerAccountId)) return [];
  const out: { accountId: string; entryId: string }[] = [];
  for (const acc of group.accounts) {
    if (acc.accountId === ownerAccountId) continue;
    const sessionIds = new Set<string>();
    const seen = new Set<string>();
    for (const entry of acc.entries) {
      if (entry.importId !== undefined) {
        sessionIds.add(entry.importId);
      } else if (!seen.has(entry.id)) {
        // No session backref — fall back to the lone matched copy.
        seen.add(entry.id);
        out.push({ accountId: acc.accountId, entryId: entry.id });
      }
    }
    if (sessionIds.size === 0) continue;
    for (const entry of history[acc.accountId] ?? []) {
      if (entry.importId === undefined || !sessionIds.has(entry.importId))
        continue;
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
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
