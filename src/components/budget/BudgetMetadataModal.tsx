import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Split, Tags } from "lucide-react";

import { resolveEntryLabels } from "../../data/synthesis";
import { derivePatternFromDescription } from "../../data/budget/pattern-derive";
import {
  matchingBankDescriptionEntries,
  type HistoryMetadataPatch,
} from "../../data/budget/pattern-apply";
import {
  autoTypeForCompany,
  descriptionCompanyHintsFor,
} from "../../data/company-type-hints";
import {
  budgetMetadataFormReducer,
  EMPTY_METADATA_FORM_FIELDS,
  initialMetadataFormState,
  type MetadataFormFields,
} from "./budget-metadata-form-reducer";
import {
  budgetMetadataSplitReducer,
  buildFinalSplits,
  canCommitContinue,
  canFinish,
  makeInitialSplitState,
  splitRemaining,
} from "./budget-metadata-split-reducer";
import { useAutoTypeForCompany } from "../../hooks";
import { useLang, useT } from "../../i18n";
import type {
  Category,
  Company,
  EntryType,
  HistoryEntry,
  HistoryEntrySplit,
  MatchRule,
  MerchantHint,
  Settings,
  Tag,
} from "../../data/types";
import {
  formatBalance,
  formatDate,
  formatShortDate,
  formatYearMonth,
} from "../../utils/format";
import { indexById } from "../../utils/indexById";
import { CompanyPicker } from "../CompanyPicker";
import { Button, Checkbox, ClearableInput, SignedAmountInput } from "../form";
import { Modal } from "../Modal";
import { TagsPicker } from "../TagsPicker";
import { TypePicker } from "../TypePicker";

// "Metadata mode" — a focused walk through the history entries that
// still need a custom description or a type. Reached from the budget
// page's `…` menu. One entry at a time, biggest absolute amount first,
// newest month first. Mirror-image of `BudgetFindConflictsModal`'s
// step-through cleanup pattern but scoped to per-entry annotation
// rather than de-duplication.
//
// "Needs metadata" is `resolveEntryLabels` (the same resolver the
// synthesized history row reads) returning either no type at all OR
// description equal to the raw bank text — i.e. nothing has been said
// about this entry by an override, a match rule, or a merchant hint.
// Entries that the budget UI already hides (`hidden`,
// `collapsedIntoTransferId`, `isTransfer`) are excluded, as are
// entries with `splits` because the single-row picker doesn't apply.

type Props = {
  open: boolean;
  onClose: () => void;
  // Account whose history is being walked. `null` (unlinked budget)
  // disables the mode — there's nothing to annotate.
  accountId: string | null;
  // Bank-imported entries for `accountId`. Same set the budget page
  // already receives as a prop.
  entries: readonly HistoryEntry[];
  merchantHints: Readonly<Record<string, MerchantHint>>;
  matchRules: readonly MatchRule[];
  types: readonly EntryType[];
  categories: readonly Category[];
  companies: readonly Company[];
  tags: readonly Tag[];
  // companyId → suggested typeId for the auto-fill, and companyId →
  // ranked hint typeIds for the picker's "Suggested" band. See
  // `src/data/company-type-hints.ts`.
  companyTypeSuggestions: ReadonlyMap<string, string>;
  companyTypeHints: ReadonlyMap<string, readonly string[]>;
  // normalised description → ranked companyIds (see
  // `computeDescriptionCompanyHints`). Surfaces the company the user
  // has tagged the current entry's merchant with before as the
  // CompanyPicker's "Suggested" band.
  descriptionCompanyHints: ReadonlyMap<string, readonly string[]>;
  settings: Settings;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  onCreateTag: (draft: Omit<Tag, "id">) => Tag;
  onUpdateHistoryEntry: (
    accountId: string,
    entryId: string,
    patch: {
      userDescription?: string;
      userTypeId?: string | null;
      userCompanyId?: string | null;
      userTagIds?: string[];
      isTransfer?: boolean;
      noCompany?: boolean;
    },
  ) => void;
  // Stamp the labels the user gave the current entry onto its
  // lookalikes (same account, raw bank description matches the derived
  // pattern). Fills blank fields only; tags union. `excludeEntryIds`
  // carries the source entry (saved through `onUpdateHistoryEntry`
  // separately) plus any lookalikes the user unchecked in the
  // selection list.
  onApplyMetadataToMatchingHistory: (
    accountId: string,
    pattern: string,
    excludeEntryIds: readonly string[],
    patch: HistoryMetadataPatch,
  ) => void;
  // Persist a split decomposition for the current entry without leaving
  // the walk. `splits` is the full, already-balanced set of parts (the
  // last one absorbs the remainder), so the running balance stays
  // anchored to the bank's total. Mirrors the scissors-button split flow
  // but built inline so a Klarna-style entry can be carved as it's
  // reviewed instead of hunting for the row afterwards.
  onSplitHistoryEntry: (
    accountId: string,
    entryId: string,
    splits: HistoryEntrySplit[],
  ) => void;
};

function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
}

// Order-insensitive equality for two tag-id selections — the picker
// hands back a fresh array on every toggle, so reference equality can't
// tell a real change from a re-render. Used by the `dirty` check.
function sameTagSet(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  const set = new Set(a);
  for (const id of b) if (!set.has(id)) return false;
  return true;
}

function entryNeedsMetadata(
  entry: HistoryEntry,
  hints: Readonly<Record<string, MerchantHint>>,
  rules: readonly MatchRule[],
  companies: ReadonlyMap<string, Company>,
  types: ReadonlyMap<string, EntryType>,
): boolean {
  if (entry.hidden) return false;
  if (entry.collapsedIntoTransferId) return false;
  if (entry.isTransfer) return false;
  if (entry.splits && entry.splits.length > 0) return false;
  const resolved = resolveEntryLabels(entry, hints, rules, companies, types);
  // The entry still wants a closer look when any of the three first-
  // class fields is missing: no type pinned, no company tagged, OR the
  // resolved description is still the raw bank text. `entry.noCompany`
  // exempts the entry from the company check — set from the "No
  // company needed" toggle in the modal for entries where tagging a
  // merchant doesn't apply (e.g. salary, internal transfers).
  return (
    resolved.typeId === null ||
    (resolved.companyId === null && !entry.noCompany) ||
    resolved.description === entry.description
  );
}

export function BudgetMetadataModal({
  open,
  onClose,
  accountId,
  entries,
  merchantHints,
  matchRules,
  types,
  categories,
  companies,
  tags,
  companyTypeSuggestions,
  companyTypeHints,
  descriptionCompanyHints,
  settings,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
  onCreateTag,
  onUpdateHistoryEntry,
  onApplyMetadataToMatchingHistory,
  onSplitHistoryEntry,
}: Props) {
  const t = useT();
  const lang = useLang();
  // Session-only skip set — closing the modal clears it. Persisting
  // would mean "never ask again", which is not the intent: skipping
  // is just "not now, ask later".
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(() => new Set());
  // Session-only set of entries the user has already saved in this
  // modal session. The denominator in "x of y" is otherwise a moving
  // target — once an entry gets `userTypeId` / `userDescription` it
  // no longer "needs metadata", so a naive recount would drop the
  // total in lockstep with the index and the counter would stay
  // glued at "1 of n-1". Remembering completions keeps the
  // denominator stable across the walk.
  const [completed, setCompleted] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  // The entries the user has already advanced past this session, in the
  // order they were left behind (oldest first). Each Save / Skip from
  // the live front pushes the entry here so Back can walk back to it —
  // the queue itself drops a handled entry, so without this trail there
  // would be nothing to return to. Cleared on close alongside the rest.
  const [trail, setTrail] = useState<readonly string[]>(() => []);
  // Cursor into `trail` while reviewing a past entry. `null` means we're
  // at the live front (showing `queue[0]`). Back moves it toward the
  // start of the trail; Save / Skip on a reviewed entry moves it forward
  // again, falling back to `null` once it passes the newest trail entry.
  const [reviewIndex, setReviewIndex] = useState<number | null>(null);
  // "Also apply to N similar entries" — opt-in per entry, defaults off
  // so a bulk sweep is never a surprise. Reset when the entry changes
  // (the save / skip handler advances to a new entry) and on close.
  const [bulkApply, setBulkApply] = useState(false);
  // Lookalikes the user unchecked in the expanded selection list —
  // everything starts checked, so this only holds the opt-outs. Reset
  // whenever the bulk checkbox toggles, the entry changes, or the
  // modal closes, so a fresh offer always starts from "all selected".
  const [bulkExcluded, setBulkExcluded] = useState<ReadonlySet<string>>(
    () => new Set(),
  );
  const handleBulkApplyChange = useCallback((checked: boolean) => {
    setBulkApply(checked);
    setBulkExcluded(new Set());
  }, []);
  const toggleBulkEntry = useCallback((entryId: string, checked: boolean) => {
    setBulkExcluded((prev) => {
      const next = new Set(prev);
      if (checked) next.delete(entryId);
      else next.add(entryId);
      return next;
    });
  }, []);
  // Split mode — `splitting` swaps the per-entry form for the inline
  // split builder; `splitState` holds the parts built so far plus the
  // in-progress draft (see `budget-metadata-split-reducer`). Both reset
  // when the entry changes or the modal closes so a half-built split
  // never leaks onto the next entry.
  const [splitting, setSplitting] = useState(false);
  const [splitState, dispatchSplit] = useReducer(
    budgetMetadataSplitReducer,
    undefined,
    makeInitialSplitState,
  );
  useEffect(() => {
    if (!open) {
      setSkipped(new Set());
      setCompleted(new Set());
      setTrail([]);
      setReviewIndex(null);
      setBulkApply(false);
      setBulkExcluded(new Set());
      setSplitting(false);
    }
  }, [open]);

  // Build id-indexed maps for companies and types once per (companies,
  // types) change. The metadata walk calls `resolveEntryLabels` once
  // per entry inside two filter loops (`queue`, `monthTotal`); building
  // the maps at the loop boundary avoids the per-entry linear array
  // scans that the resolver's company-name / type-name fallbacks would
  // otherwise repeat.
  const companiesById = useMemo(() => indexById(companies), [companies]);
  const typesById = useMemo(() => indexById(types), [types]);

  // Queue is derived from props every render — saving an entry makes
  // it resolve and fall out naturally on the next render.
  const queue = useMemo(() => {
    const filtered = entries.filter(
      (e) =>
        !skipped.has(e.id) &&
        entryNeedsMetadata(
          e,
          merchantHints,
          matchRules,
          companiesById,
          typesById,
        ),
    );
    filtered.sort((a, b) => {
      const monthA = monthKeyOf(a.date);
      const monthB = monthKeyOf(b.date);
      if (monthA !== monthB) return monthB.localeCompare(monthA);
      const absDiff = Math.abs(b.amount) - Math.abs(a.amount);
      if (absDiff !== 0) return absDiff;
      return a.id.localeCompare(b.id);
    });
    return filtered;
  }, [entries, merchantHints, matchRules, companiesById, typesById, skipped]);

  // The live front of the queue — the next genuinely-unhandled entry.
  const liveCurrent = queue[0] ?? null;
  // The entry being reviewed, if Back walked the cursor into the trail.
  // Looked up by id so it works whether the entry was skipped (still in
  // the queue's source but filtered out) or saved (already resolved and
  // gone from the queue). A stale id (entry no longer present) falls
  // back to the live front.
  const reviewEntry =
    reviewIndex !== null
      ? (entries.find((e) => e.id === trail[reviewIndex]) ?? null)
      : null;
  const current = reviewEntry ?? liveCurrent;
  const isReviewing = reviewEntry !== null;
  // The company the user has tagged this merchant with before, surfaced
  // as the CompanyPicker's "Suggested" band. Keyed off the entry's raw
  // bank description so it lines up with the normalised memory.
  const companyHintIds = descriptionCompanyHintsFor(
    descriptionCompanyHints,
    current?.description,
  );
  // Back is reachable whenever there's an older entry to step to: from
  // the live front, any trail entry; while reviewing, any earlier one.
  const canGoBack =
    reviewIndex === null ? trail.length > 0 : isReviewing && reviewIndex > 0;
  const currentMonth = current ? monthKeyOf(current.date) : null;
  const monthRemaining = currentMonth
    ? queue.filter((e) => monthKeyOf(e.date) === currentMonth).length
    : 0;
  const monthTotal = useMemo(() => {
    if (!currentMonth) return 0;
    let n = 0;
    for (const e of entries) {
      if (monthKeyOf(e.date) !== currentMonth) continue;
      if (
        entryNeedsMetadata(
          e,
          merchantHints,
          matchRules,
          companiesById,
          typesById,
        ) ||
        completed.has(e.id)
      )
        n += 1;
    }
    return n;
  }, [
    entries,
    merchantHints,
    matchRules,
    companiesById,
    typesById,
    currentMonth,
    completed,
  ]);
  const monthIndex = monthTotal > 0 ? monthTotal - monthRemaining + 1 : 0;

  // The per-entry form fields plus their seed snapshot live in one
  // reducer so the reset-on-entry-change transition is a single
  // dispatch (see `budget-metadata-form-reducer`). The seed snapshot
  // (`form.initial`) lets the save handler stamp per-entry overrides
  // only for fields the user actually changed — otherwise "review and
  // Save" on a rule-resolved entry would silently lock the rule's
  // values into per-entry overrides, fine until the rule changes and
  // this entry refuses to follow.
  const [form, dispatchForm] = useReducer(
    budgetMetadataFormReducer,
    EMPTY_METADATA_FORM_FIELDS,
    initialMetadataFormState,
  );
  const { description, typeId, companyId, tagIds, noCompany, isTransfer } =
    form;
  const setDescription = useCallback(
    (value: string) => dispatchForm({ kind: "setDescription", value }),
    [],
  );
  const setTypeId = useCallback(
    (value: string | null) => dispatchForm({ kind: "setTypeId", value }),
    [],
  );
  const setTagIds = useCallback(
    (value: string[]) => dispatchForm({ kind: "setTagIds", value }),
    [],
  );
  const setNoCompany = useCallback(
    (value: boolean) => dispatchForm({ kind: "setNoCompany", value }),
    [],
  );
  const setIsTransfer = useCallback(
    (value: boolean) => dispatchForm({ kind: "setIsTransfer", value }),
    [],
  );
  const autoTypeForPickedCompany = useAutoTypeForCompany(
    typeId,
    companyTypeSuggestions,
  );
  const handlePickCompany = useCallback(
    (next: string | null) => {
      dispatchForm({
        kind: "pickCompany",
        companyId: next,
        autoTypeId: autoTypeForPickedCompany(next),
      });
    },
    [autoTypeForPickedCompany],
  );

  // Pre-populate the form with whatever is already resolved for the
  // current entry so the user sees existing metadata (and can edit
  // it) instead of a blank form. The description field is left blank
  // when the resolved description still equals the raw bank text —
  // the placeholder shows the bank text and a save with blank keeps
  // the fallthrough behaviour. Resets when the current entry id
  // changes (save / skip moves on; modal open lands on entry #1).
  // Re-initialising mid-edit when an unrelated prop (companies,
  // types, …) updates would discard the user's in-progress input —
  // the closure here captures the latest values at run time, which
  // is precisely when the effect re-runs (entry change).
  useEffect(() => {
    if (!current) {
      dispatchForm({ kind: "reset", fields: EMPTY_METADATA_FORM_FIELDS });
      return;
    }
    const resolved = resolveEntryLabels(
      current,
      merchantHints,
      matchRules,
      companiesById,
      typesById,
    );
    // Pre-fill only with a real user-level description (override,
    // rule, or merchant hint). The company / type / bank-text
    // fallbacks in `resolved.description` are render-time conveniences
    // for the budget tables — seeding the input with a type name
    // would push that string into `userDescription` on save and
    // permanently freeze the fallback as an override.
    const fields: MetadataFormFields = {
      description: resolved.userDescription ?? "",
      typeId: resolved.typeId,
      companyId: resolved.companyId,
      // Seed only the entry's own tags (not the rule-contributed union)
      // — saving replaces the per-entry override, and folding in a
      // rule's tags would freeze them onto the entry as an override.
      tagIds: current.userTagIds ?? [],
      noCompany: current.noCompany ?? false,
      isTransfer: current.isTransfer ?? false,
    };
    dispatchForm({ kind: "reset", fields });
    // Each entry decides afresh whether to fan out to its lookalikes.
    setBulkApply(false);
    setBulkExcluded(new Set());
    // A split-in-progress belongs to the entry it was started on — drop
    // it when the walk moves on so the builder doesn't reopen pre-filled
    // against an unrelated entry.
    setSplitting(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  // Move off the current entry to the next one. From the live front
  // this remembers the entry in the trail (the queue drops it on its
  // own once skipped or resolved); while reviewing it just steps the
  // cursor forward, returning to the live front past the newest entry.
  const advance = useCallback(() => {
    if (!current) return;
    if (reviewIndex === null) {
      setTrail((prev) => [...prev, current.id]);
    } else {
      setReviewIndex((idx) =>
        idx === null || idx + 1 >= trail.length ? null : idx + 1,
      );
    }
  }, [current, reviewIndex, trail.length]);

  const handleBack = useCallback(() => {
    setReviewIndex((idx) => {
      if (idx === null) return trail.length > 0 ? trail.length - 1 : null;
      return idx > 0 ? idx - 1 : 0;
    });
  }, [trail.length]);

  // The counterpart to Back: step the review cursor toward the live
  // front without saving or skipping. Without it, the only way to
  // leave a reviewed entry is Save (gated off when nothing changed) or
  // Skip (which wrongly drops the entry) — so revisiting a finished
  // entry would otherwise strand the walk. `null` once it passes the
  // newest trail entry, returning to the live front.
  const handleForward = useCallback(() => {
    setReviewIndex((idx) =>
      idx === null || idx + 1 >= trail.length ? null : idx + 1,
    );
  }, [trail.length]);
  // Forward is reachable whenever the cursor is parked on a past entry.
  const canGoForward = reviewIndex !== null;

  const handleSkip = useCallback(() => {
    if (!current) return;
    // Mark skipped so the entry stays out of the queue (harmless re-add
    // for an already-skipped or already-resolved entry under review).
    setSkipped((prev) => {
      const next = new Set(prev);
      next.add(current.id);
      return next;
    });
    advance();
  }, [current, advance]);

  const handleSave = useCallback(() => {
    if (!current || !accountId) return;
    const trimmed = description.trim();
    const initial = form.initial;
    const patch: {
      userDescription?: string;
      userTypeId?: string | null;
      userCompanyId?: string | null;
      userTagIds?: string[];
      isTransfer?: boolean;
      noCompany?: boolean;
    } = {};
    if (trimmed !== initial.description.trim()) {
      patch.userDescription = trimmed;
    }
    if (typeId !== initial.typeId) {
      patch.userTypeId = typeId;
    }
    if (companyId !== initial.companyId) {
      patch.userCompanyId = companyId;
    }
    if (!sameTagSet(tagIds, initial.tagIds)) {
      patch.userTagIds = tagIds;
    }
    if (isTransfer !== initial.isTransfer) {
      patch.isTransfer = isTransfer;
    }
    // Setting a company implicitly clears the "no company" flag — the
    // user changed their mind and tagged a merchant after all.
    if (companyId !== null && current.noCompany) {
      patch.noCompany = false;
    } else if (noCompany !== initial.noCompany) {
      patch.noCompany = noCompany;
    }
    if (
      patch.userDescription === undefined &&
      patch.userTypeId === undefined &&
      patch.userCompanyId === undefined &&
      patch.userTagIds === undefined &&
      patch.isTransfer === undefined &&
      patch.noCompany === undefined
    ) {
      return;
    }
    onUpdateHistoryEntry(accountId, current.id, patch);
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(current.id);
      return next;
    });
  }, [
    accountId,
    current,
    description,
    typeId,
    companyId,
    tagIds,
    noCompany,
    isTransfer,
    form.initial,
    onUpdateHistoryEntry,
  ]);

  const dirty =
    !!current &&
    (description.trim() !== form.initial.description.trim() ||
      typeId !== form.initial.typeId ||
      companyId !== form.initial.companyId ||
      !sameTagSet(tagIds, form.initial.tagIds) ||
      noCompany !== form.initial.noCompany ||
      isTransfer !== form.initial.isTransfer);

  // Bulk apply: a glob pattern derived from the current entry's raw
  // bank description (dates / ref numbers stripped, the same derivation
  // the "Label similar" modal seeds from) plus the labels the form
  // currently shows. The opt-in offer surfaces as soon as any field is
  // set and at least one lookalike matches the bank text; applying then
  // fills only the fields each match is still missing.
  const bulkPattern = useMemo(
    () => (current ? derivePatternFromDescription(current.description) : ""),
    [current],
  );
  const bulkPatch = useMemo<HistoryMetadataPatch>(() => {
    const patch: HistoryMetadataPatch = {};
    if (typeId) patch.userTypeId = typeId;
    // Company and "omit company" are mutually exclusive — propagate
    // whichever the user chose so picking "Omit company" also offers to
    // fan out, not just a real company pick.
    if (companyId) patch.userCompanyId = companyId;
    else if (noCompany) patch.noCompany = true;
    const trimmed = description.trim();
    if (trimmed !== "") patch.userDescription = trimmed;
    if (tagIds.length > 0) patch.userTagIds = tagIds;
    return patch;
  }, [typeId, companyId, noCompany, description, tagIds]);
  // True once the user has entered at least one field worth fanning out.
  // The bulk offer only makes sense when there's something to apply.
  const hasBulkFields = Object.keys(bulkPatch).length > 0;
  // The lookalikes the bank-description pattern matches, newest first
  // so the list under the checkbox reads like the budget table. The
  // offer surfaces whenever similar entries exist (not only when
  // they're missing a field you set) — applying still fills blanks
  // only, so an already-labelled match just keeps what it has.
  const lookalikes = useMemo(() => {
    if (!current) return [];
    const matches = matchingBankDescriptionEntries(
      entries,
      bulkPattern,
      current.id,
    );
    matches.sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return a.id.localeCompare(b.id);
    });
    return matches;
  }, [entries, bulkPattern, current]);
  const lookalikeCount = lookalikes.length;
  // The lookalikes still selected after the user's unchecks — the set
  // the sweep will actually touch.
  const selectedLookalikeCount = useMemo(
    () => lookalikes.filter((e) => !bulkExcluded.has(e.id)).length,
    [lookalikes, bulkExcluded],
  );
  const canBulkApply = hasBulkFields && lookalikeCount > 0;
  // Uncheck the bulk option the moment it would no longer do anything
  // (the user cleared every field, or no lookalikes remain) so a stale
  // checkmark can't fire an empty sweep on save.
  useEffect(() => {
    if (!canBulkApply && bulkApply) setBulkApply(false);
  }, [canBulkApply, bulkApply]);

  // The field that's still blocking this entry from leaving the queue,
  // computed from the current form state. Drives the `canSave` gate, the
  // hint shown next to the Save button when it's gated, and the one-shot
  // ring on the field when the user taps Save anyway. Type comes before
  // company because the company picker is only meaningful once a type
  // has been chosen — the resolver's description fallback also walks
  // company → type, so this matches the priority the user already sees
  // elsewhere. `description` isn't tracked separately: with either a
  // type or a company set, the resolver's name fallback carries the
  // description away from the raw bank text, so it can never be the
  // sole reason an entry stays in the queue.
  const stillMissingField = useMemo<"type" | "company" | null>(() => {
    if (!current) return null;
    // A transfer is just money moving between accounts — no type or
    // company applies, so suppress the missing-field gating.
    if (isTransfer) return null;
    if (!typeId) return "type";
    if (!companyId && !noCompany) return "company";
    return null;
  }, [current, typeId, companyId, noCompany, isTransfer]);

  // Save is reachable when the form changed into a *complete* entry — one
  // that will actually leave the queue (type set, and a company picked,
  // omitted, or the entry marked a transfer; `stillMissingField === null`
  // captures exactly that). Gating on `dirty` alone let a type-only edit
  // enable Save even though the entry still owed a company, so pressing
  // it stamped the type but left the same entry sitting in the walk with
  // no explanation — whereas a rule-seeded type with the same gap kept
  // Save greyed and showed the "add or omit company" hint. Requiring
  // completeness makes both paths behave the same: a missing company
  // always keeps Save gated until you pick one or choose "Omit company".
  // The bulk-sweep branch stays independent so fanning labels out to
  // lookalikes still works while reviewing an already-resolved entry.
  const canSave =
    !!accountId &&
    !!current &&
    ((dirty && stillMissingField === null) ||
      (bulkApply && canBulkApply && selectedLookalikeCount > 0));

  const typeFieldRef = useRef<HTMLDivElement | null>(null);
  const companyFieldRef = useRef<HTMLDivElement | null>(null);

  const handleSaveClick = useCallback(() => {
    if (canSave) {
      // Stamp the current entry first (no-op when nothing changed), then
      // fan the same labels out to the lookalikes still selected when
      // the user opted in. The sweep excludes the current entry (so the
      // two writes never collide) plus every unchecked lookalike.
      handleSave();
      if (
        bulkApply &&
        canBulkApply &&
        selectedLookalikeCount > 0 &&
        accountId &&
        current
      ) {
        onApplyMetadataToMatchingHistory(
          accountId,
          bulkPattern,
          [current.id, ...bulkExcluded],
          bulkPatch,
        );
      }
      advance();
      return;
    }
    // Save is gated. Pulse a ring around the next blocker so the user
    // sees what to do instead of being met with silence. Replays on
    // repeated taps because we remove the attribute, force a reflow,
    // then re-add it — React's no-op re-render would otherwise leave
    // the animation glued to its end frame.
    const target = stillMissingField;
    if (target === null) return;
    const el =
      target === "type" ? typeFieldRef.current : companyFieldRef.current;
    if (!el) return;
    el.removeAttribute("data-field-attention");
    void el.offsetWidth;
    el.setAttribute("data-field-attention", "");
  }, [
    canSave,
    handleSave,
    advance,
    stillMissingField,
    bulkApply,
    canBulkApply,
    selectedLookalikeCount,
    bulkExcluded,
    accountId,
    current,
    bulkPattern,
    bulkPatch,
    onApplyMetadataToMatchingHistory,
  ]);

  // --- Split mode ---------------------------------------------------
  const beginSplit = useCallback(() => {
    if (!current) return;
    dispatchSplit({
      kind: "begin",
      total: current.amount,
      fallbackDescription: current.description,
      settings,
    });
    setSplitting(true);
  }, [current, settings]);

  const handleSplitPickCompany = useCallback(
    (next: string | null) => {
      dispatchSplit({
        kind: "pickCompany",
        companyId: next,
        autoTypeId: autoTypeForCompany(
          splitState.draft.typeId,
          next,
          companyTypeSuggestions,
        ),
      });
    },
    [splitState.draft.typeId, companyTypeSuggestions],
  );

  const splitRemainingAmount = splitRemaining(splitState);
  const canSplitAgain = canCommitContinue(splitState);
  const canFinishSplit = canFinish(splitState);

  const handleFinishSplit = useCallback(() => {
    if (!current || !accountId || !canFinish(splitState)) return;
    onSplitHistoryEntry(accountId, current.id, buildFinalSplits(splitState));
    setCompleted((prev) => {
      const next = new Set(prev);
      next.add(current.id);
      return next;
    });
    setSplitting(false);
    advance();
  }, [current, accountId, splitState, onSplitHistoryEntry, advance]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="metadata-mode-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<Tags size={14} aria-hidden focusable={false} />}
        title={t("metadata.title")}
        onClose={onClose}
      />
      <Modal.Body>
        {current === null ? (
          <div className="rounded border border-line bg-surface-2 px-3 py-6 text-center">
            <p className="text-sm text-fg">{t("metadata.allCaught")}</p>
            <p className="mt-1 text-xs text-muted">
              {t("metadata.allCaughtHint")}
            </p>
          </div>
        ) : (
          <>
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted">
              {t("metadata.progress", {
                month: formatYearMonth(currentMonth ?? "", lang),
                index: monthIndex,
                total: monthTotal,
              })}
            </p>
            <fieldset className="mb-4 flex flex-col gap-1.5 rounded border border-line bg-surface-3 p-3">
              <legend className="px-1 text-xs text-muted">
                {t("metadata.fromBank")}
              </legend>
              <div className="flex flex-wrap items-baseline gap-2 text-xs">
                <span className="font-mono text-muted">
                  {formatShortDate(
                    current.date,
                    settings.shortDateFormat,
                    lang,
                  )}
                </span>
                <span
                  className={`font-mono tabular-nums ${
                    current.amount < 0 ? "text-negative" : "text-positive"
                  }`}
                >
                  {formatBalance(current.amount, settings)}
                </span>
              </div>
              <p className="font-mono text-sm break-words whitespace-pre-wrap text-fg">
                {current.description || "—"}
              </p>
            </fieldset>
            {splitting ? (
              <div className="grid gap-3">
                <p className="text-xs text-muted">{t("metadata.splitIntro")}</p>
                {splitState.committed.length > 0 && (
                  <div className="flex flex-col gap-1.5 rounded border border-line bg-surface-2 p-3">
                    {splitState.committed.map((s, i) => (
                      <div
                        key={i}
                        className="flex items-baseline justify-between gap-2 text-sm"
                      >
                        <span className="min-w-0 truncate text-fg">
                          <span className="mr-2 text-xs text-muted">
                            {t("metadata.splitPart", { n: i + 1 })}
                          </span>
                          {s.description}
                        </span>
                        <span
                          className={`shrink-0 font-mono tabular-nums ${
                            s.amount < 0 ? "text-negative" : "text-positive"
                          }`}
                        >
                          {formatBalance(s.amount, settings)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 rounded border border-accent/40 bg-accent/5 px-3 py-2">
                  <span className="text-xs text-muted">
                    {t("metadata.splitRemainingLabel")}
                  </span>
                  <span
                    className={`font-mono text-sm tabular-nums ${
                      splitRemainingAmount < 0
                        ? "text-negative"
                        : "text-positive"
                    }`}
                  >
                    {formatBalance(splitRemainingAmount, settings)}
                  </span>
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("metadata.amountLabel")}
                  </span>
                  <SignedAmountInput
                    value={splitState.draft.amount}
                    negative={splitState.draft.negative}
                    onValueChange={(v) =>
                      dispatchSplit({ kind: "setAmount", value: v })
                    }
                    onToggleSign={() => dispatchSplit({ kind: "toggleSign" })}
                    settings={settings}
                    ariaLabel={t("metadata.amountLabel")}
                    calculator
                  />
                </label>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("metadata.companyLabel")}
                  </span>
                  <CompanyPicker
                    variant="field"
                    companies={companies}
                    selectedId={splitState.draft.companyId}
                    noCompany={splitState.draft.noCompany}
                    onSelect={handleSplitPickCompany}
                    onOmitChange={(value) =>
                      dispatchSplit({ kind: "setNoCompany", value })
                    }
                    onCreate={onCreateCompany}
                    hintCompanyIds={companyHintIds}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("metadata.typeLabel")}
                  </span>
                  <TypePicker
                    variant="field"
                    types={types}
                    categories={categories}
                    selectedId={splitState.draft.typeId}
                    onSelect={(v) =>
                      dispatchSplit({ kind: "setType", value: v })
                    }
                    onCreate={onCreateType}
                    onCreateCategory={onCreateCategory}
                    amountSign={
                      splitState.draft.negative ? "negative" : "positive"
                    }
                    hintTypeIds={
                      splitState.draft.companyId
                        ? (companyTypeHints.get(splitState.draft.companyId) ??
                          [])
                        : []
                    }
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("metadata.tagsLabel")}
                  </span>
                  <TagsPicker
                    tags={tags}
                    selectedIds={splitState.draft.tagIds}
                    onChange={(v) =>
                      dispatchSplit({ kind: "setTags", value: v })
                    }
                    onCreate={onCreateTag}
                  />
                </div>
                <label className="flex flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("metadata.descriptionLabel")}
                  </span>
                  <ClearableInput
                    value={splitState.draft.description}
                    onValueChange={(v) =>
                      dispatchSplit({ kind: "setDescription", value: v })
                    }
                    placeholder={
                      current.description ||
                      t("metadata.descriptionPlaceholder")
                    }
                    className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                  />
                </label>
                <p className="text-xs text-muted">
                  {t("metadata.splitFinishHint")}
                </p>
              </div>
            ) : (
              <>
                <div className="grid gap-3">
                  <div ref={companyFieldRef} className="flex flex-col gap-1">
                    <span className="text-xs text-muted">
                      {t("metadata.companyLabel")}
                    </span>
                    <CompanyPicker
                      variant="field"
                      companies={companies}
                      selectedId={companyId}
                      noCompany={noCompany}
                      onSelect={handlePickCompany}
                      onOmitChange={setNoCompany}
                      onCreate={onCreateCompany}
                      hintCompanyIds={companyHintIds}
                    />
                    <span className="text-xs text-muted">
                      {noCompany
                        ? t("metadata.noCompanyHint")
                        : t("metadata.companyHint")}
                    </span>
                  </div>
                  <div ref={typeFieldRef} className="flex flex-col gap-1">
                    <span className="text-xs text-muted">
                      {t("metadata.typeLabel")}
                    </span>
                    <TypePicker
                      variant="field"
                      types={types}
                      categories={categories}
                      selectedId={typeId}
                      onSelect={setTypeId}
                      onCreate={onCreateType}
                      onCreateCategory={onCreateCategory}
                      amountSign={current.amount < 0 ? "negative" : "positive"}
                      hintTypeIds={
                        companyId ? (companyTypeHints.get(companyId) ?? []) : []
                      }
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">
                      {t("metadata.tagsLabel")}
                    </span>
                    <TagsPicker
                      tags={tags}
                      selectedIds={tagIds}
                      onChange={setTagIds}
                      onCreate={onCreateTag}
                    />
                    <span className="text-xs text-muted">
                      {t("metadata.tagsHint")}
                    </span>
                  </div>
                  <label className="flex flex-col gap-1">
                    <span className="text-xs text-muted">
                      {t("metadata.descriptionLabel")}
                    </span>
                    <ClearableInput
                      value={description}
                      onValueChange={setDescription}
                      placeholder={
                        current.description ||
                        t("metadata.descriptionPlaceholder")
                      }
                      className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
                    />
                    <span className="text-xs text-muted">
                      {t("metadata.descriptionHint")}
                    </span>
                  </label>
                  <Checkbox
                    checked={isTransfer}
                    onChange={setIsTransfer}
                    label={t("metadata.markAsTransfer")}
                    description={t("metadata.markAsTransferHint")}
                  />
                </div>
                {canBulkApply && (
                  <div className="mt-4 rounded border border-line bg-surface-3 p-3">
                    <Checkbox
                      checked={bulkApply}
                      onChange={handleBulkApplyChange}
                      label={
                        lookalikeCount === 1
                          ? t("metadata.bulkApplyOne", { n: lookalikeCount })
                          : t("metadata.bulkApplyOther", { n: lookalikeCount })
                      }
                      description={t("metadata.bulkApplyHint")}
                    />
                    {bulkApply && (
                      <div className="mt-3 flex max-h-48 flex-col gap-2 overflow-y-auto rounded border border-line bg-surface-2 p-2">
                        <p className="text-xs text-muted">
                          {t("metadata.bulkApplyListHint")}
                        </p>
                        {lookalikes.map((e) => (
                          <Checkbox
                            key={e.id}
                            checked={!bulkExcluded.has(e.id)}
                            onChange={(checked) =>
                              toggleBulkEntry(e.id, checked)
                            }
                            label={
                              <span className="flex flex-wrap items-baseline gap-x-2 font-mono text-xs">
                                <span className="shrink-0 text-muted">
                                  {formatDate(
                                    e.date,
                                    settings.dateFormat,
                                    lang,
                                  )}
                                </span>
                                <span
                                  className={`shrink-0 tabular-nums ${
                                    e.amount < 0
                                      ? "text-negative"
                                      : "text-positive"
                                  }`}
                                >
                                  {formatBalance(e.amount, settings)}
                                </span>
                              </span>
                            }
                            description={
                              <span className="font-mono break-words">
                                {e.description || "—"}
                              </span>
                            }
                          />
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <button
                  type="button"
                  onClick={beginSplit}
                  className="mt-4 inline-flex w-full cursor-pointer items-center justify-center gap-1.5 rounded border border-dashed border-line bg-transparent px-3 py-2 text-sm text-muted hover:border-accent hover:text-accent"
                >
                  <Split size={14} aria-hidden focusable={false} />
                  {t("metadata.splitCta")}
                </button>
              </>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer
        className={
          current === null || splitting
            ? ""
            : "flex-wrap justify-between gap-x-2 gap-y-1"
        }
      >
        {current === null ? (
          <Button variant="primary" onClick={onClose}>
            {t("common.close")}
          </Button>
        ) : splitting ? (
          <>
            <Button variant="secondary" onClick={() => setSplitting(false)}>
              {t("common.cancel")}
            </Button>
            <Button
              variant="secondary"
              onClick={() => dispatchSplit({ kind: "commit", settings })}
              disabled={!canSplitAgain}
            >
              {t("metadata.splitAgain")}
            </Button>
            <Button
              variant="primary"
              onClick={handleFinishSplit}
              disabled={!canFinishSplit}
            >
              {t("metadata.splitFinish")}
            </Button>
          </>
        ) : (
          <>
            <p
              aria-live="polite"
              className="min-w-0 flex-1 text-xs text-flag empty:hidden"
            >
              {!canSave && stillMissingField === "type"
                ? t("metadata.needsTypePrompt")
                : !canSave && stillMissingField === "company"
                  ? t("metadata.needsCompanyPrompt")
                  : ""}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <Button
                variant="secondary"
                onClick={handleBack}
                disabled={!canGoBack}
              >
                {t("metadata.back")}
              </Button>
              {canGoForward && (
                <Button variant="secondary" onClick={handleForward}>
                  {t("metadata.forward")}
                </Button>
              )}
              <Button variant="secondary" onClick={handleSkip}>
                {t("metadata.skip")}
              </Button>
              <Button
                variant="primary"
                onClick={handleSaveClick}
                aria-disabled={!canSave}
                className={
                  canSave
                    ? ""
                    : "cursor-not-allowed opacity-50 hover:bg-accent/10"
                }
              >
                {t("common.save")}
              </Button>
            </div>
          </>
        )}
      </Modal.Footer>
    </Modal>
  );
}
