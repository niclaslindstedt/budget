import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wand2 } from "lucide-react";

import { compilePattern, ruleMatchesEntry } from "../../data/match-rules";
import { normalizeOptional } from "../../data/normalize";
import { derivePatternFromDescription } from "../../data/budget/pattern-derive";
import { useDesktopAutoFocus } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { todayIso } from "../../utils/date";
import { createLogger } from "../../utils/logger";
import type {
  Category,
  Company,
  EntryType,
  HistoryEntry,
  MatchRule,
  Settings,
} from "../../data/types";
import { formatBalance, formatShortDate } from "../../utils/format";
import { CompanyPicker } from "../CompanyPicker";
import {
  Button,
  ClearableInput,
  FormSection,
  SignedAmountInput,
} from "../form";
import { Modal } from "../Modal";
import { TypePicker } from "../TypePicker";
import {
  useMatchRuleAmountFilter,
  type SignMode,
} from "./useMatchRuleAmountFilter";

const log = createLogger("match-rules");

type TransferFilter = NonNullable<MatchRule["transferFilter"]>;

export type MatchRuleDraft = {
  pattern: string;
  description: string;
  typeId: string | null;
  // Company id stamped on matching rows. `null` = explicit no-company
  // override (clears any prior pick on matching budget rows); a string
  // assigns the company.
  companyId: string | null;
  amountSign: NonNullable<MatchRule["amountSign"]>;
  transferFilter: TransferFilter;
  // Signed bounds. `undefined` means "no constraint" — either end of
  // the band can be open.
  amountMin: number | undefined;
  amountMax: number | undefined;
  // When false, the parent applies the rule's labels once and
  // discards the rule. Default true (persist the rule) — the
  // checkbox is the "Save pattern" toggle in the modal. Ignored when
  // editing an existing rule.
  saveRule: boolean;
};

// Minimum surface the modal needs from whatever row the user invoked
// the rule from. Both `HistoryEntry` and a budget-row projection map
// onto this shape so the modal doesn't have to branch on which kind it
// got. Either origin gets the same date / ref-number stripping in
// `pattern-derive.ts` — bank exports and manually-typed descriptions
// both embed dates that would otherwise pin the pattern to a single
// transaction.
export type MatchRuleSeed = {
  id: string;
  description: string;
  amount: number;
};

type Props = {
  open: boolean;
  // The row or history entry the user invoked the rule from. Used to
  // seed the pattern and to highlight the source in the preview.
  // Optional `null` covers two cases: the modal is being opened blank
  // from settings to author a new rule, or it's being opened to edit
  // an existing rule without re-seeding from a specific row.
  seedEntry: MatchRuleSeed | null;
  // Every history entry on the active account, used to preview the
  // rule's matches live as the user types. Empty when the modal is
  // opened from settings without an active account context.
  allEntries: readonly HistoryEntry[];
  // Existing rule to edit, or null for a new one. When non-null the
  // form seeds from the rule rather than the seed entry's raw text;
  // saving updates rather than appends.
  existing: MatchRule | null;
  categories: readonly Category[];
  types: readonly EntryType[];
  companies: readonly Company[];
  settings: Settings;
  onClose: () => void;
  onSubmit: (draft: MatchRuleDraft) => void;
  onDelete?: () => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
};

const PREVIEW_LIMIT = 8;

// One row per matching history entry in the preview. The seed entry is
// always rendered first when it's part of the match set so the user
// can see "yes the row I clicked is in the result". Other matches
// follow in newest-first order to mirror the History modal.
function previewEntries(
  matches: readonly HistoryEntry[],
  seed: { id: string } | null,
): readonly HistoryEntry[] {
  if (matches.length === 0) return matches;
  if (!seed) return matches.slice(0, PREVIEW_LIMIT);
  const seedMatch = matches.find((m) => m.id === seed.id);
  const rest = matches.filter((m) => m.id !== seed.id);
  const ordered = seedMatch ? [seedMatch, ...rest] : rest;
  return ordered.slice(0, PREVIEW_LIMIT);
}

// Seed the pattern from the source row. Both history entries and
// budget rows go through the date / ref-number stripper in
// `pattern-derive.ts` — bank exports routinely embed the transaction
// date in the description (Skandia ships `<date> <merchant>`) and
// manually-typed descriptions tend to read `<merchant> <date>`. Either
// would otherwise pin the pattern to a single transaction.
function seedPatternFromSeed(seed: MatchRuleSeed): string {
  return derivePatternFromDescription(seed.description);
}

export function BudgetMatchRuleModal({
  open,
  seedEntry,
  allEntries,
  existing,
  categories,
  types,
  companies,
  settings,
  onClose,
  onSubmit,
  onDelete,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isEdit = existing !== null;

  const [pattern, setPattern] = useState("");
  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [transferFilter, setTransferFilter] = useState<TransferFilter>("any");
  // "Save pattern" — when checked (the default) the rule is persisted
  // alongside the labels it applies; when unchecked the parent stamps
  // matching rows / history once and throws the rule away. The latter
  // is the right tool for bulk-labelling older entries from a merchant
  // that's never coming back (the canonical example in the project
  // brief: a pizzeria the user moved away from).
  const [saveRule, setSaveRule] = useState(true);

  const amountFilter = useMatchRuleAmountFilter(
    open,
    existing,
    seedEntry,
    settings,
  );
  const {
    isRangeMode,
    isExactMode,
    amountMin,
    amountMax,
    amountSign,
    rangeInverted,
    exactBlank,
  } = amountFilter.derived;

  const patternRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(patternRef, open);

  useEffect(() => {
    if (!open) return;
    setSaveRule(true);
    if (existing) {
      setPattern(existing.pattern);
      setDescription(existing.description ?? "");
      setTypeId(existing.typeId ?? null);
      setCompanyId(existing.companyId ?? null);
      setTransferFilter(existing.transferFilter ?? "any");
      return;
    }
    setPattern(seedEntry ? seedPatternFromSeed(seedEntry) : "");
    setDescription("");
    setTypeId(null);
    setCompanyId(null);
    setTransferFilter("exclude");
  }, [open, existing, seedEntry]);

  // Compile the regex once per pattern; an empty pattern yields no
  // matches without throwing. Wrapped in useMemo so the live preview
  // doesn't recompile on every unrelated render.
  const compiled = useMemo<RegExp | null>(() => {
    if (pattern.length === 0) return null;
    try {
      return compilePattern(pattern);
    } catch {
      return null;
    }
  }, [pattern]);

  const draft = useMemo<MatchRule>(
    () => ({
      id: existing?.id ?? "preview",
      pattern,
      description: normalizeOptional(description),
      typeId,
      companyId,
      amountSign,
      transferFilter,
      amountMin: rangeInverted ? undefined : amountMin,
      amountMax: rangeInverted ? undefined : amountMax,
    }),
    [
      existing,
      pattern,
      description,
      typeId,
      companyId,
      amountSign,
      transferFilter,
      amountMin,
      amountMax,
      rangeInverted,
    ],
  );

  // All history entries the rule would match. Recomputed on every
  // field change so the preview reflects current filters. The list
  // can be long; we trim it to PREVIEW_LIMIT in the renderer below.
  // An inverted band would short-circuit `ruleMatchesEntry` anyway,
  // but force zero matches up front so the preview shows no rows.
  const matches = useMemo<HistoryEntry[]>(() => {
    if (!compiled || rangeInverted) return [];
    return allEntries.filter((e) => ruleMatchesEntry(draft, e));
  }, [allEntries, draft, compiled, rangeInverted]);

  const shownMatches = useMemo(
    () => previewEntries(matches, seedEntry),
    [matches, seedEntry],
  );

  // Walk the preview rows and intersperse year-header rows so a list
  // that crosses calendar years stays legible — the per-row date is
  // short ("25/5") and otherwise hides the year. Headers are only
  // emitted for past years; current-year rows render bare since the
  // year is the user's implicit default.
  const previewItems = useMemo<
    Array<
      { kind: "year"; year: number } | { kind: "entry"; entry: HistoryEntry }
    >
  >(() => {
    const items: Array<
      { kind: "year"; year: number } | { kind: "entry"; entry: HistoryEntry }
    > = [];
    const currentYear = Number(todayIso().slice(0, 4));
    let lastSeenYear: number | null = null;
    for (const e of shownMatches) {
      const entryYear = Number(e.date.slice(0, 4));
      if (
        Number.isFinite(entryYear) &&
        entryYear < currentYear &&
        entryYear !== lastSeenYear
      ) {
        items.push({ kind: "year", year: entryYear });
      }
      items.push({ kind: "entry", entry: e });
      if (Number.isFinite(entryYear)) {
        lastSeenYear = entryYear;
      }
    }
    return items;
  }, [shownMatches]);

  const canSave =
    pattern.trim().length > 0 &&
    compiled !== null &&
    !rangeInverted &&
    !exactBlank;

  const handleSubmit = useCallback(() => {
    if (!canSave) {
      log.warn(
        `apply blocked: canSave=false ` +
          `patternLen=${pattern.trim().length} ` +
          `compiled=${compiled !== null} ` +
          `rangeInverted=${rangeInverted} ` +
          `exactBlank=${exactBlank}`,
      );
      return;
    }
    // Edits always persist — the "Save pattern" toggle is hidden in
    // edit mode, so an edited rule can't be downgraded to a one-shot
    // sweep by accident.
    const willSave = isEdit ? true : saveRule;
    log.info(
      `apply: pattern=${JSON.stringify(pattern.trim())} ` +
        `signMode=${amountFilter.state.signMode} amountSign=${amountSign} ` +
        `amountMin=${amountMin ?? "(none)"} ` +
        `amountMax=${amountMax ?? "(none)"} ` +
        `transferFilter=${transferFilter} ` +
        `typeId=${typeId ?? "(none)"} ` +
        `description=${JSON.stringify(description.trim())} ` +
        `previewMatches=${matches.length}/${allEntries.length} ` +
        `isEdit=${isEdit} saveRule=${willSave}`,
    );
    onSubmit({
      pattern: pattern.trim(),
      description: description.trim(),
      typeId,
      companyId,
      amountSign,
      transferFilter,
      amountMin,
      amountMax,
      saveRule: willSave,
    });
  }, [
    canSave,
    onSubmit,
    pattern,
    description,
    typeId,
    companyId,
    amountFilter.state.signMode,
    amountSign,
    transferFilter,
    amountMin,
    amountMax,
    compiled,
    rangeInverted,
    exactBlank,
    matches.length,
    allEntries.length,
    isEdit,
    saveRule,
  ]);

  if (!open) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="match-rule-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<Wand2 size={14} aria-hidden focusable={false} />}
        title={
          isEdit ? t("matchRule.titleEdit") : t("matchRule.titleLabelByPattern")
        }
        onClose={onClose}
      />
      <Modal.Body>
        <p className="mb-3 text-sm text-muted">
          {t("matchRule.intro")} {t("matchRule.introWild")}{" "}
          <code className="text-flag">*</code> {t("matchRule.introOne")}
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted">{t("matchRule.pattern")}</span>
            <ClearableInput
              ref={patternRef}
              value={pattern}
              onValueChange={setPattern}
              spellCheck={false}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
              placeholder={t("matchRule.patternPlaceholder")}
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted">
              {t("matchRule.descriptionOptional")}
            </span>
            <ClearableInput
              value={description}
              onValueChange={setDescription}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
              placeholder={t("matchRule.descriptionPlaceholder")}
            />
          </label>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted">{t("matchRule.type")}</span>
            <TypePicker
              variant="field"
              types={types}
              categories={categories}
              selectedId={typeId}
              onSelect={setTypeId}
              onCreate={onCreateType}
              onCreateCategory={onCreateCategory}
            />
          </div>
          <div className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted">{t("matchRule.company")}</span>
            <CompanyPicker
              variant="field"
              companies={companies}
              selectedId={companyId}
              onSelect={setCompanyId}
              onCreate={onCreateCompany}
            />
          </div>
        </div>

        <fieldset className="mt-4 flex flex-col gap-3 rounded border border-line bg-surface-3 p-3">
          <legend className="px-1 text-xs text-muted">
            {t("matchRule.filters")}
          </legend>
          <FormSection label={t("matchRule.amountLabel")}>
            <SegmentedRadio
              name="amount-sign"
              value={amountFilter.state.signMode}
              onChange={(v) => amountFilter.setSignMode(v as SignMode)}
              options={[
                { value: "any", label: t("matchRule.amountAny") },
                { value: "negative", label: t("matchRule.amountNegative") },
                { value: "positive", label: t("matchRule.amountPositive") },
                { value: "exact", label: t("matchRule.amountExact") },
                { value: "range", label: t("matchRule.amountRange") },
              ]}
            />
            {isExactMode && (
              <div className="mt-1 flex flex-col gap-1.5">
                <SignedAmountInput
                  value={amountFilter.state.exactText}
                  negative={amountFilter.state.exactNegative}
                  onValueChange={amountFilter.setExactText}
                  onToggleSign={amountFilter.toggleExactNegative}
                  settings={settings}
                  ariaLabel={t("matchRule.amountExactAria")}
                  placeholder={t("matchRule.amountExactPlaceholder")}
                  density="compact"
                  width="w-32"
                />
              </div>
            )}
            {isRangeMode && (
              <div className="mt-1 flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <SignedAmountInput
                    value={amountFilter.state.minText}
                    negative={amountFilter.state.minNegative}
                    onValueChange={amountFilter.setMinText}
                    onToggleSign={amountFilter.toggleMinNegative}
                    settings={settings}
                    ariaLabel={t("matchRule.amountFromAria")}
                    placeholder={t("matchRule.amountFrom")}
                    density="compact"
                    width="w-32"
                  />
                  <span className="text-xs text-muted">
                    {t("matchRule.amountToLabel")}
                  </span>
                  <SignedAmountInput
                    value={amountFilter.state.maxText}
                    negative={amountFilter.state.maxNegative}
                    onValueChange={amountFilter.setMaxText}
                    onToggleSign={amountFilter.toggleMaxNegative}
                    settings={settings}
                    ariaLabel={t("matchRule.amountToAria")}
                    placeholder={t("matchRule.amountTo")}
                    density="compact"
                    width="w-32"
                  />
                </div>
                {rangeInverted && (
                  <p className="text-xs text-danger">
                    {t("matchRule.rangeInvertedHint")}
                  </p>
                )}
              </div>
            )}
          </FormSection>
          <FormSection label={t("matchRule.transferFilter")}>
            <SegmentedRadio
              name="transfer-filter"
              value={transferFilter}
              onChange={(v) => setTransferFilter(v as TransferFilter)}
              options={[
                { value: "any", label: t("matchRule.transferAny") },
                { value: "exclude", label: t("matchRule.transferExclude") },
                { value: "only", label: t("matchRule.transferOnly") },
              ]}
            />
          </FormSection>
        </fieldset>

        {!isEdit && (
          <div className="mt-3">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-fg">
              <input
                type="checkbox"
                checked={saveRule}
                onChange={(e) => setSaveRule(e.target.checked)}
                className="h-4 w-4 cursor-pointer"
              />
              {t("matchRule.savePattern")}
            </label>
            <p className="mt-1 ml-6 text-xs text-muted">
              {saveRule
                ? t("matchRule.savePatternHintOn")
                : t("matchRule.savePatternHintOff")}
            </p>
          </div>
        )}

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <h3 className="text-xs font-bold tracking-wider uppercase text-muted">
              {t("matchRule.preview")}
            </h3>
            <span className="text-xs text-muted">
              {matches.length === 1
                ? t("matchRule.matchesOne", { n: matches.length })
                : t("matchRule.matchesOther", { n: matches.length })}
              {matches.length > shownMatches.length
                ? t("matchRule.showingFirst", { n: shownMatches.length })
                : ""}
            </span>
          </div>
          <div className="overflow-hidden rounded border border-line bg-surface-2">
            {!compiled ? (
              <p className="px-3 py-3 text-center text-xs text-muted">
                {t("matchRule.typePatternToPreview")}
              </p>
            ) : shownMatches.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs text-muted">
                {t("matchRule.noHistoryMatches")}
              </p>
            ) : (
              <ul className="divide-y divide-line text-xs">
                {previewItems.map((item) =>
                  item.kind === "year" ? (
                    <li
                      key={`year-${item.year}`}
                      className="bg-surface-3 px-3 py-1 text-xs font-bold uppercase tracking-wider text-muted"
                    >
                      {item.year}
                    </li>
                  ) : (
                    <li
                      key={item.entry.id}
                      className={`flex items-baseline gap-2 px-3 py-1.5 ${
                        seedEntry && item.entry.id === seedEntry.id
                          ? "bg-surface-3"
                          : ""
                      }`}
                    >
                      <span className="w-12 font-mono text-muted">
                        {formatShortDate(
                          item.entry.date,
                          settings.shortDateFormat,
                          lang,
                        )}
                      </span>
                      <span className="flex-1 truncate text-fg">
                        {item.entry.description}
                      </span>
                      <span
                        className={`shrink-0 font-mono tabular-nums ${
                          item.entry.amount < 0
                            ? "text-negative"
                            : "text-positive"
                        }`}
                      >
                        {formatBalance(item.entry.amount, settings)}
                      </span>
                    </li>
                  ),
                )}
              </ul>
            )}
          </div>
        </div>
      </Modal.Body>
      <Modal.Footer>
        {isEdit && onDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="mr-auto cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:border-danger hover:text-danger"
          >
            {t("matchRule.delete")}
          </button>
        )}
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSave}>
          {isEdit
            ? t("common.save")
            : saveRule
              ? t("matchRule.labelMatchesCount", { n: matches.length })
              : t("matchRule.labelMatchesOnceCount", { n: matches.length })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

type SegmentedOption = { value: string; label: string };

type SegmentedProps = {
  name: string;
  value: string;
  options: readonly SegmentedOption[];
  onChange: (next: string) => void;
};

// Three-way radio rendered as a row of pill buttons. Used inline by
// the filter fieldset above; not promoted to a shared component
// because no other modal currently needs the shape.
function SegmentedRadio({ name, value, options, onChange }: SegmentedProps) {
  return (
    <div role="radiogroup" className="inline-flex rounded border border-line">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(opt.value)}
            className={`flex-1 cursor-pointer border-0 px-2.5 py-1 text-xs ${
              selected
                ? "bg-accent/15 text-accent"
                : "bg-transparent text-muted hover:text-fg"
            }`}
            name={name}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
