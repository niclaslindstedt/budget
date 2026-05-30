import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { Tags } from "lucide-react";

import { resolveEntryLabels } from "../../data/budget/synthesis";
import { derivePatternFromDescription } from "../../data/budget/pattern-derive";
import {
  countMatchingBankDescription,
  type HistoryMetadataPatch,
} from "../../data/budget/pattern-apply";
import {
  budgetMetadataFormReducer,
  EMPTY_METADATA_FORM_FIELDS,
  initialMetadataFormState,
  type MetadataFormFields,
} from "./budget-metadata-form-reducer";
import { useAutoTypeForCompany } from "../../hooks";
import { useLang, useT } from "../../i18n";
import type {
  Category,
  Company,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Settings,
  Tag,
} from "../../data/types";
import {
  formatBalance,
  formatShortDate,
  formatYearMonth,
} from "../../utils/format";
import { indexById } from "../../utils/indexById";
import { CompanyPicker } from "../CompanyPicker";
import { Button, Checkbox, ClearableInput } from "../form";
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
  // companyId → suggested typeId for the auto-fill. See
  // `computeCompanyTypeSuggestions` in `src/data/budget/company-type-suggestions.ts`.
  companyTypeSuggestions: ReadonlyMap<string, string>;
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
  // pattern). Fills blank fields only; tags union. The source entry is
  // excluded — it's saved through `onUpdateHistoryEntry` separately.
  onApplyMetadataToMatchingHistory: (
    accountId: string,
    pattern: string,
    excludeEntryId: string,
    patch: HistoryMetadataPatch,
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
  settings,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
  onCreateTag,
  onUpdateHistoryEntry,
  onApplyMetadataToMatchingHistory,
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
  useEffect(() => {
    if (!open) {
      setSkipped(new Set());
      setCompleted(new Set());
      setTrail([]);
      setReviewIndex(null);
      setBulkApply(false);
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
  // How many lookalikes the bank-description pattern matches. The offer
  // surfaces whenever similar entries exist (not only when they're
  // missing a field you set) — applying still fills blanks only, so an
  // already-labelled match just keeps what it has.
  const lookalikeCount = useMemo(() => {
    if (!current) return 0;
    return countMatchingBankDescription(entries, bulkPattern, current.id);
  }, [entries, bulkPattern, current]);
  const canBulkApply = hasBulkFields && lookalikeCount > 0;
  // Uncheck the bulk option the moment it would no longer do anything
  // (the user cleared every field, or no lookalikes remain) so a stale
  // checkmark can't fire an empty sweep on save.
  useEffect(() => {
    if (!canBulkApply && bulkApply) setBulkApply(false);
  }, [canBulkApply, bulkApply]);

  // Save is reachable when the form changed (stamp the current entry)
  // OR the user opted into a bulk sweep that has targets (even on an
  // already-resolved entry the user is reviewing).
  const canSave =
    !!accountId && !!current && (dirty || (bulkApply && canBulkApply));

  // The field that's still blocking this entry from leaving the queue,
  // computed from the current form state. Drives both the hint shown
  // next to the Save button when it's gated and the one-shot ring on
  // the field when the user taps Save anyway. Type comes before
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

  const typeFieldRef = useRef<HTMLDivElement | null>(null);
  const companyFieldRef = useRef<HTMLDivElement | null>(null);

  const handleSaveClick = useCallback(() => {
    if (canSave) {
      // Stamp the current entry first (no-op when nothing changed), then
      // fan the same labels out to its lookalikes when the user opted
      // in. The sweep excludes the current entry, so the two writes
      // never collide.
      handleSave();
      if (bulkApply && canBulkApply && accountId && current) {
        onApplyMetadataToMatchingHistory(
          accountId,
          bulkPattern,
          current.id,
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
    accountId,
    current,
    bulkPattern,
    bulkPatch,
    onApplyMetadataToMatchingHistory,
  ]);

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
            <div className="grid gap-3">
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
                />
              </div>
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
                />
                <span className="text-xs text-muted">
                  {noCompany
                    ? t("metadata.noCompanyHint")
                    : t("metadata.companyHint")}
                </span>
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
                    current.description || t("metadata.descriptionPlaceholder")
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
                  onChange={setBulkApply}
                  label={
                    lookalikeCount === 1
                      ? t("metadata.bulkApplyOne", { n: lookalikeCount })
                      : t("metadata.bulkApplyOther", { n: lookalikeCount })
                  }
                  description={t("metadata.bulkApplyHint")}
                />
              </div>
            )}
          </>
        )}
      </Modal.Body>
      <Modal.Footer
        className={
          current === null ? "" : "flex-wrap justify-between gap-x-2 gap-y-1"
        }
      >
        {current === null ? (
          <Button variant="primary" onClick={onClose}>
            {t("common.close")}
          </Button>
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
