import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Tags } from "lucide-react";

import { resolveEntryLabels } from "../../data/budget/synthesis";
import { useLang, useT } from "../../i18n";
import type {
  Category,
  Company,
  EntryType,
  HistoryEntry,
  MatchRule,
  MerchantHint,
  Settings,
} from "../../data/types";
import {
  formatBalance,
  formatShortDate,
  formatYearMonth,
} from "../../utils/format";
import { CompanyPicker } from "../CompanyPicker";
import { Button, ClearableInput } from "../form";
import { Modal } from "../Modal";
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
  settings: Settings;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
  onUpdateHistoryEntry: (
    accountId: string,
    entryId: string,
    patch: {
      userDescription?: string;
      userTypeId?: string | null;
      userCompanyId?: string | null;
      noCompany?: boolean;
    },
  ) => void;
};

function monthKeyOf(iso: string): string {
  return iso.slice(0, 7);
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
  settings,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
  onUpdateHistoryEntry,
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
  useEffect(() => {
    if (!open) {
      setSkipped(new Set());
      setCompleted(new Set());
    }
  }, [open]);

  // Build id-indexed maps for companies and types once per (companies,
  // types) change. The metadata walk calls `resolveEntryLabels` once
  // per entry inside two filter loops (`queue`, `monthTotal`); building
  // the maps at the loop boundary avoids the per-entry linear array
  // scans that the resolver's company-name / type-name fallbacks would
  // otherwise repeat.
  const companiesById = useMemo(() => {
    const m = new Map<string, Company>();
    for (const c of companies) m.set(c.id, c);
    return m;
  }, [companies]);
  const typesById = useMemo(() => {
    const m = new Map<string, EntryType>();
    for (const t of types) m.set(t.id, t);
    return m;
  }, [types]);

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

  const current = queue[0] ?? null;
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

  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [noCompany, setNoCompany] = useState(false);
  // Snapshot of the values the form was pre-populated with, so the
  // save handler only stamps per-entry overrides for fields the user
  // actually changed. Otherwise "review and Save" on a rule-resolved
  // entry would silently lock the rule's values into per-entry
  // overrides — fine until the rule changes and this entry refuses
  // to follow.
  const initialRef = useRef({
    description: "",
    typeId: null as string | null,
    companyId: null as string | null,
    noCompany: false,
  });

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
      setDescription("");
      setTypeId(null);
      setCompanyId(null);
      setNoCompany(false);
      initialRef.current = {
        description: "",
        typeId: null,
        companyId: null,
        noCompany: false,
      };
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
    const initDescription = resolved.userDescription ?? "";
    setDescription(initDescription);
    setTypeId(resolved.typeId);
    setCompanyId(resolved.companyId);
    setNoCompany(current.noCompany ?? false);
    initialRef.current = {
      description: initDescription,
      typeId: resolved.typeId,
      companyId: resolved.companyId,
      noCompany: current.noCompany ?? false,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current?.id]);

  const handleSkip = useCallback(() => {
    if (!current) return;
    setSkipped((prev) => {
      const next = new Set(prev);
      next.add(current.id);
      return next;
    });
  }, [current]);

  const handleSave = useCallback(() => {
    if (!current || !accountId) return;
    const trimmed = description.trim();
    const initial = initialRef.current;
    const patch: {
      userDescription?: string;
      userTypeId?: string | null;
      userCompanyId?: string | null;
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
    noCompany,
    onUpdateHistoryEntry,
  ]);

  const dirty =
    !!current &&
    (description.trim() !== initialRef.current.description.trim() ||
      typeId !== initialRef.current.typeId ||
      companyId !== initialRef.current.companyId ||
      noCompany !== initialRef.current.noCompany);
  const canSave = !!accountId && !!current && dirty;

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
    if (!typeId) return "type";
    if (!companyId && !noCompany) return "company";
    return null;
  }, [current, typeId, companyId, noCompany]);

  const typeFieldRef = useRef<HTMLDivElement | null>(null);
  const companyFieldRef = useRef<HTMLDivElement | null>(null);

  const handleSaveClick = useCallback(() => {
    if (canSave) {
      handleSave();
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
  }, [canSave, handleSave, stillMissingField]);

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
                  onSelect={(id) => {
                    setCompanyId(id);
                    // Picking a company contradicts "no company
                    // needed" — clear the opt-out so the checkbox
                    // mirrors reality.
                    if (id !== null) setNoCompany(false);
                  }}
                  onCreate={onCreateCompany}
                />
                <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={noCompany}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setNoCompany(next);
                      // Checking the opt-out clears any company
                      // pick; unchecking leaves the picker as-is.
                      if (next) setCompanyId(null);
                    }}
                    className="h-3.5 w-3.5 cursor-pointer"
                  />
                  {t("metadata.noCompanyLabel")}
                </label>
                <span className="text-xs text-muted">
                  {noCompany
                    ? t("metadata.noCompanyHint")
                    : t("metadata.companyHint")}
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
            </div>
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
