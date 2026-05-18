import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { compilePattern, ruleMatchesEntry } from "../data/match-rules";
import { useDesktopAutoFocus } from "../hooks";
import type {
  Category,
  EntryType,
  HistoryEntry,
  MatchRule,
  Settings,
} from "../data/types";
import { formatBalance, formatShortDate } from "../utils/format";
import { CategoryPicker } from "./CategoryPicker";
import { Modal } from "./Modal";
import { TypePicker } from "./TypePicker";

type AmountSign = NonNullable<MatchRule["amountSign"]>;
type TransferFilter = NonNullable<MatchRule["transferFilter"]>;

export type MatchRuleDraft = {
  pattern: string;
  description: string;
  categoryId: string | null;
  typeId: string | null;
  amountSign: AmountSign;
  transferFilter: TransferFilter;
};

type Props = {
  open: boolean;
  // The history entry the user invoked the rule from. Used to seed the
  // pattern with that entry's raw bank text, and to highlight which
  // entry is the "source" of the rule in the preview.
  seedEntry: HistoryEntry | null;
  // Every history entry on the active account, used to preview the
  // rule's matches live as the user types.
  allEntries: readonly HistoryEntry[];
  // Existing rule to edit, or null for a new one. When non-null the
  // form seeds from the rule rather than the seed entry's raw text;
  // saving updates rather than appends.
  existing: MatchRule | null;
  categories: Category[];
  types: readonly EntryType[];
  typeUsageById?: ReadonlyMap<string, number>;
  settings: Settings;
  onClose: () => void;
  onSubmit: (draft: MatchRuleDraft) => void;
  onDelete?: () => void;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
};

const PREVIEW_LIMIT = 8;

// One row per matching history entry in the preview. The seed entry is
// always rendered first when it's part of the match set so the user
// can see "yes the row I clicked is in the result". Other matches
// follow in newest-first order to mirror the History modal.
function previewEntries(
  matches: readonly HistoryEntry[],
  seed: HistoryEntry | null,
): readonly HistoryEntry[] {
  if (matches.length === 0) return matches;
  if (!seed) return matches.slice(0, PREVIEW_LIMIT);
  const rest = matches.filter((m) => m.id !== seed.id);
  const seedMatched = matches.some((m) => m.id === seed.id);
  const ordered = seedMatched ? [seed, ...rest] : rest;
  return ordered.slice(0, PREVIEW_LIMIT);
}

// Seed the pattern from the bank text by wrapping it in stars so a
// returning user lands on a working substring match by default. The
// raw text from a bank statement is often dominated by a stable
// merchant token plus noise — wrapping with `*…*` is the right
// default; the user can sharpen the pattern from there.
function seedPatternFromDescription(text: string): string {
  const trimmed = text.trim();
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
  typeUsageById,
  settings,
  onClose,
  onSubmit,
  onDelete,
  onCreateCategory,
  onCreateType,
}: Props) {
  const isEdit = existing !== null;

  const [pattern, setPattern] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [amountSign, setAmountSign] = useState<AmountSign>("any");
  const [transferFilter, setTransferFilter] = useState<TransferFilter>("any");

  const patternRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(patternRef, open);

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setPattern(existing.pattern);
      setDescription(existing.description ?? "");
      setCategoryId(existing.categoryId ?? null);
      setTypeId(existing.typeId ?? null);
      setAmountSign(existing.amountSign ?? "any");
      setTransferFilter(existing.transferFilter ?? "any");
      return;
    }
    setPattern(seedPatternFromDescription(seedEntry?.description ?? ""));
    setDescription("");
    setCategoryId(null);
    setTypeId(null);
    // Seed sign filter from the row the user invoked from: most
    // descriptions are tied to one direction (a refund vs a purchase
    // for the same merchant), so defaulting to the seed's sign keeps
    // a fat-fingered "BAUHAUS" rule from sweeping the inverse
    // direction by accident. The user can flip to "Any" if they
    // really want both.
    if (seedEntry) {
      setAmountSign(seedEntry.amount < 0 ? "negative" : "positive");
    } else {
      setAmountSign("any");
    }
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
      description: description.trim() === "" ? undefined : description.trim(),
      categoryId,
      typeId,
      amountSign,
      transferFilter,
    }),
    [
      existing,
      pattern,
      description,
      categoryId,
      typeId,
      amountSign,
      transferFilter,
    ],
  );

  // All history entries the rule would match. Recomputed on every
  // field change so the preview reflects current filters. The list
  // can be long; we trim it to PREVIEW_LIMIT in the renderer below.
  const matches = useMemo<HistoryEntry[]>(() => {
    if (!compiled) return [];
    return allEntries.filter((e) => ruleMatchesEntry(draft, e));
  }, [allEntries, draft, compiled]);

  const shownMatches = useMemo(
    () => previewEntries(matches, seedEntry),
    [matches, seedEntry],
  );

  const canSave = pattern.trim().length > 0 && compiled !== null;

  const handleSubmit = useCallback(() => {
    if (!canSave) return;
    onSubmit({
      pattern: pattern.trim(),
      description: description.trim(),
      categoryId,
      typeId,
      amountSign,
      transferFilter,
    });
  }, [
    canSave,
    onSubmit,
    pattern,
    description,
    categoryId,
    typeId,
    amountSign,
    transferFilter,
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
        title={isEdit ? "Edit pattern rule" : "Label by pattern"}
        onClose={onClose}
      />
      <Modal.Body>
        <p className="mb-3 text-sm text-muted">
          Label every history entry whose description matches this pattern. Use{" "}
          <code className="text-flag">*</code> to match any characters; matching
          is case-insensitive. Applies to past entries and future imports.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted">Pattern</span>
            <input
              ref={patternRef}
              type="text"
              value={pattern}
              onChange={(e) => setPattern(e.target.value)}
              spellCheck={false}
              className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
              placeholder="*App Store*"
            />
          </label>
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted">Description (optional)</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
              placeholder="Leave blank to keep the bank's text"
            />
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">Category</span>
            <CategoryPicker
              variant="field"
              categories={categories}
              selectedId={categoryId}
              onSelect={setCategoryId}
              onCreate={onCreateCategory}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">Type</span>
            <TypePicker
              variant="field"
              types={types}
              selectedId={typeId}
              onSelect={setTypeId}
              onCreate={onCreateType}
              usageById={typeUsageById}
            />
          </div>
        </div>

        <fieldset className="mt-4 rounded border border-line bg-surface-3 p-3">
          <legend className="px-1 text-xs text-muted">Filters</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Amount</span>
              <SegmentedRadio
                name="amount-sign"
                value={amountSign}
                onChange={(v) => setAmountSign(v as AmountSign)}
                options={[
                  { value: "any", label: "Any" },
                  { value: "negative", label: "Negative" },
                  { value: "positive", label: "Positive" },
                ]}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-xs text-muted">Transfers</span>
              <SegmentedRadio
                name="transfer-filter"
                value={transferFilter}
                onChange={(v) => setTransferFilter(v as TransferFilter)}
                options={[
                  { value: "any", label: "Any" },
                  { value: "exclude", label: "Exclude" },
                  { value: "only", label: "Only" },
                ]}
              />
            </div>
          </div>
        </fieldset>

        <div className="mt-4">
          <div className="mb-1.5 flex items-baseline justify-between">
            <h3 className="text-xs font-bold tracking-wider uppercase text-muted">
              Preview
            </h3>
            <span className="text-xs text-muted">
              {matches.length} {matches.length === 1 ? "match" : "matches"}
              {matches.length > shownMatches.length
                ? ` (showing first ${shownMatches.length})`
                : ""}
            </span>
          </div>
          <div className="overflow-hidden rounded border border-line bg-surface-2">
            {!compiled ? (
              <p className="px-3 py-3 text-center text-xs text-muted">
                Type a pattern to preview matches.
              </p>
            ) : shownMatches.length === 0 ? (
              <p className="px-3 py-3 text-center text-xs text-muted">
                No history entries match.
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
                      {formatShortDate(e.date, settings.shortDateFormat)}
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
            Delete rule
          </button>
        )}
        <button
          type="button"
          onClick={onClose}
          className="cursor-pointer rounded border border-line px-3 py-1.5 text-sm text-muted hover:text-fg"
        >
          Cancel
        </button>
        <button
          type="button"
          onClick={handleSubmit}
          disabled={!canSave}
          className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {isEdit ? "Save" : `Label ${matches.length}`}
        </button>
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
