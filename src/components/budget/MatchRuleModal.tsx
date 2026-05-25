import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Wand2 } from "lucide-react";

import { compilePattern, ruleMatchesEntry } from "../../data/match-rules";
import { derivePatternFromDescription } from "../../data/pattern-derive";
import { useDesktopAutoFocus } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { createLogger } from "../../utils/logger";
import type {
  Category,
  EntryType,
  HistoryEntry,
  MatchRule,
  Settings,
} from "../../data/types";
import {
  formatAmountForInput,
  formatBalance,
  formatShortDate,
  parseAmount,
} from "../../utils/format";
import { Button, ClearableTextInput, SignedAmountInput } from "../form";
import { Modal } from "../Modal";
import { TypePicker } from "../TypePicker";

const log = createLogger("match-rules");

type AmountSign = NonNullable<MatchRule["amountSign"]>;
type TransferFilter = NonNullable<MatchRule["transferFilter"]>;
// UI-only mode that extends the persisted `amountSign` with two extra
// options: "exact" pins to a single amount (stored as
// `amountMin === amountMax`), and "range" stores a signed band. Both
// are mutually exclusive with the sign filters — picking either hides
// the sign filter and surfaces the bounded-amount inputs; picking
// Any / Negative / Positive clears the bounds. The persisted
// `amountSign` stays "any" while in either mode (the bounds carry
// their own sign) so the data model is unchanged.
type SignMode = AmountSign | "exact" | "range";

export type MatchRuleDraft = {
  pattern: string;
  description: string;
  typeId: string | null;
  amountSign: AmountSign;
  transferFilter: TransferFilter;
  // Signed bounds. `undefined` means "no constraint" — either end of
  // the band can be open.
  amountMin: number | undefined;
  amountMax: number | undefined;
};

// Minimum surface the modal needs from whatever row the user invoked
// the rule from. Both `HistoryEntry` and a budget-row projection map
// onto this shape so the modal doesn't have to branch on which kind it
// got. The `kind` discriminator picks the pattern-seeding strategy —
// history entries seed with their raw bank text (most are already
// short-and-canonical), budget rows seed with a date-stripped derivation
// because a manual description tends to read `<merchant> <date>` and
// would otherwise pin the pattern to a single row.
export type MatchRuleSeed = {
  id: string;
  description: string;
  amount: number;
  kind: "history" | "row";
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
  settings: Settings;
  onClose: () => void;
  onSubmit: (draft: MatchRuleDraft) => void;
  onDelete?: () => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
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

// Seed the pattern from the source row. History entries get the raw
// bank text wrapped in stars (most bank labels are dominated by a
// stable merchant token plus noise). Budget rows go through the date /
// ref-number stripper in `pattern-derive.ts` because manually-typed
// descriptions tend to read `<merchant> <date>` and would otherwise
// pin the pattern to a single transaction.
function seedPatternFromSeed(seed: MatchRuleSeed): string {
  if (seed.kind === "row")
    return derivePatternFromDescription(seed.description);
  const trimmed = seed.description.trim();
  if (trimmed === "") return "";
  return `*${trimmed}*`;
}

export function MatchRuleModal({
  open,
  seedEntry,
  allEntries,
  existing,
  categories,
  types,
  settings,
  onClose,
  onSubmit,
  onDelete,
  onCreateType,
  onCreateCategory,
}: Props) {
  const t = useT();
  const lang = useLang();
  const isEdit = existing !== null;

  const [pattern, setPattern] = useState("");
  const [description, setDescription] = useState("");
  const [typeId, setTypeId] = useState<string | null>(null);
  const [signMode, setSignMode] = useState<SignMode>("any");
  const [transferFilter, setTransferFilter] = useState<TransferFilter>("any");
  // The "between" range. Each bound has a magnitude (text) and a
  // sign, mirroring the +/- toggle pattern used by the other amount
  // inputs in the app. An empty text means "no bound".
  const [amountMinText, setAmountMinText] = useState("");
  const [amountMinNegative, setAmountMinNegative] = useState(true);
  const [amountMaxText, setAmountMaxText] = useState("");
  const [amountMaxNegative, setAmountMaxNegative] = useState(true);
  // Single signed amount used when the user picks the Exact mode.
  // Persisted as `amountMin === amountMax` so the matcher needs no
  // changes — only the UI distinguishes "exact" from "1-wide range".
  const [amountExactText, setAmountExactText] = useState("");
  const [amountExactNegative, setAmountExactNegative] = useState(true);

  const patternRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(patternRef, open);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setPattern(existing.pattern);
      setDescription(existing.description ?? "");
      setTypeId(existing.typeId ?? null);
      // A rule with both bounds equal collapses to Exact mode (one
      // input). A rule with any other combination of bounds keeps the
      // legacy Range mode. A rule without bounds shows the saved sign
      // filter as before.
      const minDef = existing.amountMin !== undefined;
      const maxDef = existing.amountMax !== undefined;
      const isExact =
        minDef && maxDef && existing.amountMin === existing.amountMax;
      setSignMode(
        isExact
          ? "exact"
          : minDef || maxDef
            ? "range"
            : (existing.amountSign ?? "any"),
      );
      setTransferFilter(existing.transferFilter ?? "any");
      if (existing.amountMin !== undefined) {
        setAmountMinText(
          formatAmountForInput(Math.abs(existing.amountMin), settings),
        );
        setAmountMinNegative(existing.amountMin < 0);
      } else {
        setAmountMinText("");
        setAmountMinNegative(true);
      }
      if (existing.amountMax !== undefined) {
        setAmountMaxText(
          formatAmountForInput(Math.abs(existing.amountMax), settings),
        );
        setAmountMaxNegative(existing.amountMax < 0);
      } else {
        setAmountMaxText("");
        setAmountMaxNegative(true);
      }
      if (isExact) {
        setAmountExactText(
          formatAmountForInput(Math.abs(existing.amountMin!), settings),
        );
        setAmountExactNegative(existing.amountMin! < 0);
      } else {
        setAmountExactText("");
        setAmountExactNegative(true);
      }
      return;
    }
    setPattern(seedEntry ? seedPatternFromSeed(seedEntry) : "");
    setDescription("");
    setTypeId(null);
    // Seed sign filter from the row the user invoked from: most
    // descriptions are tied to one direction (a refund vs a purchase
    // for the same merchant), so defaulting to the seed's sign keeps
    // a fat-fingered "BAUHAUS" rule from sweeping the inverse
    // direction by accident. The user can flip to "Any" if they
    // really want both.
    if (seedEntry) {
      setSignMode(seedEntry.amount < 0 ? "negative" : "positive");
    } else {
      setSignMode("any");
    }
    setTransferFilter("exclude");
    setAmountMinText("");
    setAmountMaxText("");
    setAmountExactText("");
    // Default the toggles to the seed's direction so the user can
    // type magnitudes without first remembering to flip the sign.
    const seedNeg = seedEntry ? seedEntry.amount < 0 : true;
    setAmountMinNegative(seedNeg);
    setAmountMaxNegative(seedNeg);
    setAmountExactNegative(seedNeg);
  }, [open, existing, seedEntry, settings]);

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

  // Resolve each bound to a signed JS number (or undefined when the
  // user left the field blank or range/exact mode is off). Done once
  // so the preview, the draft, and the submit handler all agree on
  // what "this band means".
  const isRangeMode = signMode === "range";
  const isExactMode = signMode === "exact";
  const amountExact = useMemo(
    () =>
      isExactMode
        ? parseSignedAmount(amountExactText, amountExactNegative)
        : undefined,
    [isExactMode, amountExactText, amountExactNegative],
  );
  // In Exact mode the single value drives both ends of the band so
  // the matcher (which still compares amountMin <= a <= amountMax)
  // accepts only that exact amount. Range mode keeps the user's
  // From/To inputs. Otherwise both ends are undefined (no bounds).
  const amountMin = useMemo(() => {
    if (isExactMode) return amountExact;
    if (isRangeMode) return parseSignedAmount(amountMinText, amountMinNegative);
    return undefined;
  }, [isExactMode, isRangeMode, amountExact, amountMinText, amountMinNegative]);
  const amountMax = useMemo(() => {
    if (isExactMode) return amountExact;
    if (isRangeMode) return parseSignedAmount(amountMaxText, amountMaxNegative);
    return undefined;
  }, [isExactMode, isRangeMode, amountExact, amountMaxText, amountMaxNegative]);
  // Reject a band where the user has typed both ends but inverted
  // them (min > max). The preview falls through to zero matches so
  // the user sees the mistake immediately. Exact mode collapses min
  // and max to the same value, so this can only fire in range mode.
  const rangeInverted =
    amountMin !== undefined && amountMax !== undefined && amountMin > amountMax;
  // Persisted sign filter — "any" while in range or exact mode, since
  // the bounds carry their own sign.
  const amountSign: AmountSign = isRangeMode || isExactMode ? "any" : signMode;

  const draft = useMemo<MatchRule>(
    () => ({
      id: existing?.id ?? "preview",
      pattern,
      description: description.trim() === "" ? undefined : description.trim(),
      typeId,
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

  const exactBlank = isExactMode && amountExact === undefined;
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
    log.info(
      `apply: pattern=${JSON.stringify(pattern.trim())} ` +
        `signMode=${signMode} amountSign=${amountSign} ` +
        `amountMin=${amountMin ?? "(none)"} ` +
        `amountMax=${amountMax ?? "(none)"} ` +
        `transferFilter=${transferFilter} ` +
        `typeId=${typeId ?? "(none)"} ` +
        `description=${JSON.stringify(description.trim())} ` +
        `previewMatches=${matches.length}/${allEntries.length} ` +
        `isEdit=${isEdit}`,
    );
    onSubmit({
      pattern: pattern.trim(),
      description: description.trim(),
      typeId,
      amountSign,
      transferFilter,
      amountMin,
      amountMax,
    });
  }, [
    canSave,
    onSubmit,
    pattern,
    description,
    typeId,
    signMode,
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
            <ClearableTextInput
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
            <ClearableTextInput
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
        </div>

        <fieldset className="mt-4 flex flex-col gap-3 rounded border border-line bg-surface-3 p-3">
          <legend className="px-1 text-xs text-muted">
            {t("matchRule.filters")}
          </legend>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">
              {t("matchRule.amountLabel")}
            </span>
            <SegmentedRadio
              name="amount-sign"
              value={signMode}
              onChange={(v) => setSignMode(v as SignMode)}
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
                  value={amountExactText}
                  negative={amountExactNegative}
                  onValueChange={setAmountExactText}
                  onToggleSign={() => setAmountExactNegative((s) => !s)}
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
                    value={amountMinText}
                    negative={amountMinNegative}
                    onValueChange={setAmountMinText}
                    onToggleSign={() => setAmountMinNegative((s) => !s)}
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
                    value={amountMaxText}
                    negative={amountMaxNegative}
                    onValueChange={setAmountMaxText}
                    onToggleSign={() => setAmountMaxNegative((s) => !s)}
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
          </div>
          <div className="flex flex-col gap-1.5">
            <span className="text-xs text-muted">
              {t("matchRule.transferFilter")}
            </span>
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
          </div>
        </fieldset>

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
                {shownMatches.map((e) => (
                  <li
                    key={e.id}
                    className={`flex items-baseline gap-2 px-3 py-1.5 ${
                      seedEntry && e.id === seedEntry.id ? "bg-surface-3" : ""
                    }`}
                  >
                    <span className="w-12 font-mono text-muted">
                      {formatShortDate(e.date, settings.shortDateFormat, lang)}
                    </span>
                    <span className="flex-1 truncate text-fg">
                      {e.description}
                    </span>
                    <span
                      className={`shrink-0 font-mono tabular-nums ${
                        e.amount < 0 ? "text-negative" : "text-positive"
                      }`}
                    >
                      {formatBalance(e.amount, settings)}
                    </span>
                  </li>
                ))}
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
            : t("matchRule.labelMatchesCount", { n: matches.length })}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// Convert one bound's magnitude text + sign toggle into a signed
// number. Returns `undefined` when the field is blank (no bound) so
// the caller can leave that end of the band open.
function parseSignedAmount(
  text: string,
  negative: boolean,
): number | undefined {
  if (text.trim() === "") return undefined;
  const abs = parseAmount(text);
  if (abs === null) return undefined;
  const mag = Math.abs(abs);
  if (mag === 0) return 0;
  return negative ? -mag : mag;
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
