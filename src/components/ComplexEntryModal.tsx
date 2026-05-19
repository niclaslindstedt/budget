import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Minus, Plus } from "lucide-react";

import { formulaToStored, parseFormula } from "../data/formula";
import type { RecurrenceRule } from "../data/recurrence";
import type { Category, EntryType, Settings, Sheet } from "../data/types";
import { normalizeAmountInput, parseAmount } from "../utils/format";
import { CategoryPicker } from "./CategoryPicker";
import { FormulaVariableHelper } from "./FormulaVariableHelper";
import { Modal } from "./Modal";
import { RecurrenceForm } from "./RecurrenceForm";
import { TypePicker } from "./TypePicker";

type Props = {
  open: boolean;
  initialDate: string;
  categories: Category[];
  types: readonly EntryType[];
  typeUsageById?: ReadonlyMap<string, number>;
  settings: Settings;
  // All sheets in the workspace. Used by the formula editor's
  // autocomplete (sheet name suggestions) and the name ↔ id transform
  // on submit (`formulaToStored`) so the persisted form always holds
  // stable sheet ids.
  sheets: readonly Sheet[];
  // Optional initial values used to pre-fill the form when the modal
  // opens. The recurring-candidate promote flow passes one so the user
  // can adjust the detected description / amount / cadence before
  // committing. When `seed` is null the modal opens blank (the existing
  // "New entry" behaviour from the budget add-row button).
  seed?: ComplexEntrySeed | null;
  // Optional title override. Defaults to "New entry"; the promote flow
  // sets "Promote candidate" so the modal's purpose is obvious.
  title?: string;
  // Optional submit-button label override. Defaults to "Add"; the
  // promote flow sets "Promote" so the action verb matches the title.
  submitVerb?: string;
  onClose: () => void;
  onCreate: (entries: ComplexEntryDraft) => void;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
};

export type ComplexEntrySeed = {
  description: string;
  // Signed: negative seeds the sign toggle as "−"; positive as "+".
  amount: number;
  categoryId: string | null;
  typeId: string | null;
  rule: import("../data/recurrence").RecurrenceRule | null;
};

export type ComplexEntryDraft = {
  description: string;
  amount: number;
  categoryId: string | null;
  // `null` = no type assigned (row falls back to its description as
  // the primary label); a string stamps every generated row with that
  // typeId so the cell renders the type's chip in the description
  // column.
  typeId: string | null;
  dates: string[];
  // Optional formula string in the canonical stored form (any
  // `sheet("…")` reference holds the target's stable id, not its
  // display name). When present, the dispatcher attaches it to each
  // generated row's `amountFormula`; the renderer recomputes the
  // effective amount on every render. `amount` still carries a
  // numeric preview for the cached cell so older builds without
  // formula support see a sensible static fallback.
  amountFormula?: string;
};

export function ComplexEntryModal({
  open,
  initialDate,
  categories,
  types,
  typeUsageById,
  settings,
  sheets,
  seed,
  title,
  submitVerb,
  onClose,
  onCreate,
  onCreateCategory,
  onCreateType,
}: Props) {
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [negative, setNegative] = useState(true);
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  // fx mode swaps the numeric amount input for a formula textarea
  // (`endOfMonthBalance - 5000`, `sheet("Wife").endOfMonthBalance`, …).
  // The displayed text shows sheet **names** for readability; on
  // submit, `formulaToStored` rewrites them to stable sheet ids so
  // renames don't break the formula.
  const [formulaMode, setFormulaMode] = useState(false);
  const [formulaText, setFormulaText] = useState("");
  // Lets the variable-helper dropdown splice tokens at the caret and
  // restore focus + cursor position afterwards.
  const formulaInputRef = useRef<HTMLInputElement>(null);
  // resetKey bumps when the modal re-opens so RecurrenceForm re-seeds.
  const [resetKey, setResetKey] = useState(0);

  useEffect(() => {
    if (!open) return;
    if (seed) {
      setDescription(seed.description);
      const abs = Math.abs(seed.amount);
      setAmountText(
        abs === 0 ? "" : normalizeAmountInput(String(abs), settings),
      );
      setNegative(seed.amount < 0);
      setCategoryId(seed.categoryId);
      setTypeId(seed.typeId);
    } else {
      setDescription("");
      setAmountText("");
      setNegative(true);
      setCategoryId(null);
      setTypeId(null);
    }
    setDates([]);
    setFormulaMode(false);
    setFormulaText("");
    setResetKey((k) => k + 1);
  }, [open, seed, settings]);

  const handleRuleChange = useCallback(
    (_rule: RecurrenceRule | null, nextDates: string[]) => {
      setDates(nextDates);
    },
    [],
  );

  const parsedAbs = useMemo(() => parseAmount(amountText), [amountText]);
  const parsedAmount = useMemo(
    () =>
      parsedAbs === null
        ? null
        : negative
          ? -Math.abs(parsedAbs)
          : Math.abs(parsedAbs),
    [parsedAbs, negative],
  );

  // Live parse the formula so the user sees a syntax error as they
  // type. The semantic preview (against the sheet) is intentionally
  // skipped here — without a target sheet/month/opening-balance we
  // can't compute one cheaply, and a bad guess would be more
  // misleading than no guess. Live parse alone catches the common
  // mistakes (mismatched parens, unknown operator, bad string).
  const formulaError = useMemo(() => {
    if (!formulaMode) return null;
    const trimmed = formulaText.trim();
    if (trimmed === "") return null;
    const r = parseFormula(trimmed);
    return r.ok ? null : r.error;
  }, [formulaMode, formulaText]);

  const handleAmountChange = (next: string) => {
    // Sign lives on the toggle button — strip any minus the keyboard or
    // a paste produces so the input only ever shows the absolute value.
    const stripped = next.replace(/-/g, "");
    setAmountText(normalizeAmountInput(stripped, settings));
  };

  const toggleSign = () => setNegative((s) => !s);
  const toggleFormulaMode = () => setFormulaMode((m) => !m);

  const insertFormulaToken = useCallback(
    (text: string) => {
      const el = formulaInputRef.current;
      const start = el?.selectionStart ?? formulaText.length;
      const end = el?.selectionEnd ?? formulaText.length;
      const next = formulaText.slice(0, start) + text + formulaText.slice(end);

      // Drop the caret into the first "hole" of the inserted snippet so
      // the user can keep typing without manually navigating: between
      // empty quotes for id/name arguments, or right after the open
      // paren when the function takes multiple arguments. Plain
      // variables and the bare `()` form fall through to "end of
      // insert".
      let caretInInsert = text.length;
      const emptyQuotes = text.indexOf('("")');
      const argSep = text.indexOf(", ");
      const emptyParens = text.indexOf("()");
      if (emptyQuotes >= 0) caretInInsert = emptyQuotes + 2;
      else if (argSep >= 0) caretInInsert = argSep;
      else if (emptyParens >= 0) caretInInsert = emptyParens + 1;

      setFormulaText(next);
      requestAnimationFrame(() => {
        const inp = formulaInputRef.current;
        if (!inp) return;
        inp.focus();
        const caret = start + caretInInsert;
        inp.setSelectionRange(caret, caret);
      });
    },
    [formulaText],
  );

  function handleSubmit() {
    if (dates.length === 0) return;
    if (formulaMode) {
      const trimmed = formulaText.trim();
      if (trimmed === "") return;
      const parsed = parseFormula(trimmed);
      if (!parsed.ok) return;
      const stored = formulaToStored(trimmed, sheets);
      if (!stored.ok) return;
      onCreate({
        description: description.trim(),
        // `amount` carries a 0 placeholder so the row is savable; the
        // renderer recomputes the real value via the resolver. A
        // future cache write could put a best-effort preview here.
        amount: 0,
        categoryId,
        typeId,
        dates,
        amountFormula: stored.formula,
      });
      return;
    }
    if (parsedAmount === null) return;
    onCreate({
      description: description.trim(),
      amount: parsedAmount,
      categoryId,
      typeId,
      dates,
    });
  }

  const formulaResolves = useMemo(() => {
    if (!formulaMode) return null;
    const trimmed = formulaText.trim();
    if (trimmed === "") return null;
    if (formulaError !== null) return null;
    return formulaToStored(trimmed, sheets);
  }, [formulaMode, formulaText, formulaError, sheets]);

  const canSubmit =
    dates.length > 0 &&
    (formulaMode
      ? formulaText.trim() !== "" &&
        formulaError === null &&
        formulaResolves !== null &&
        formulaResolves.ok
      : parsedAmount !== null);

  return (
    <Modal
      open={open}
      onClose={onClose}
      labelledBy="complex-entry-title"
      size="max-w-2xl"
    >
      <Modal.Header title={title ?? "New entry"} onClose={onClose} />
      <Modal.Body>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted">Description</span>
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="field-input rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
              placeholder="Rent, Spotify, Salary…"
            />
          </label>
          <div className="flex flex-col gap-1 sm:col-span-2">
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
          <label className="flex flex-col gap-1">
            <span className="flex items-center justify-between text-xs text-muted">
              <span>Amount</span>
              <button
                type="button"
                onClick={toggleFormulaMode}
                aria-pressed={formulaMode}
                title={
                  formulaMode
                    ? "Switch back to a fixed amount"
                    : "Use a formula instead of a fixed amount"
                }
                className={`cursor-pointer rounded border px-1.5 py-0.5 font-mono text-[10px] leading-none hover:text-fg ${
                  formulaMode
                    ? "border-accent bg-accent/10 text-accent"
                    : "border-line text-muted"
                }`}
              >
                fx
              </button>
            </span>
            {formulaMode ? (
              <div className="flex gap-1.5">
                <input
                  ref={formulaInputRef}
                  type="text"
                  value={formulaText}
                  onChange={(e) => setFormulaText(e.target.value)}
                  className="field-input flex-1 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
                  placeholder="endOfMonthBalance - 5000"
                  spellCheck={false}
                  autoCapitalize="off"
                  autoCorrect="off"
                />
                <FormulaVariableHelper onInsert={insertFormulaToken} />
              </div>
            ) : (
              <div className="relative flex">
                <button
                  type="button"
                  onClick={toggleSign}
                  aria-label={negative ? "Make positive" : "Make negative"}
                  tabIndex={-1}
                  className={`absolute inset-y-0 left-0 z-10 flex w-7 cursor-pointer items-center justify-center border-0 bg-transparent p-0 hover:text-fg-bright ${
                    negative ? "text-negative" : "text-positive"
                  }`}
                >
                  {negative ? (
                    <Minus size={14} aria-hidden focusable={false} />
                  ) : (
                    <Plus size={14} aria-hidden focusable={false} />
                  )}
                </button>
                <input
                  type="text"
                  inputMode="decimal"
                  value={amountText}
                  onChange={(e) => handleAmountChange(e.target.value)}
                  className={`field-input flex-1 rounded border border-line bg-surface-2 py-1.5 pr-2 pl-7 text-right font-mono text-sm tabular-nums ${
                    parsedAbs !== null && parsedAbs !== 0
                      ? negative
                        ? "text-negative"
                        : "text-positive"
                      : "text-fg"
                  }`}
                  placeholder="1200"
                />
              </div>
            )}
            {formulaMode && formulaError !== null ? (
              <span className="text-xs text-negative">{formulaError}</span>
            ) : null}
            {formulaMode &&
            formulaError === null &&
            formulaResolves !== null &&
            !formulaResolves.ok ? (
              <span className="text-xs text-negative">
                {formulaResolves.error}
              </span>
            ) : null}
            {formulaMode &&
            formulaText.trim() !== "" &&
            formulaError === null &&
            formulaResolves !== null &&
            formulaResolves.ok ? (
              <span className="text-xs text-muted">
                Formula evaluated per row at render time.
              </span>
            ) : null}
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
        </div>

        <div className="mt-5">
          <div className="mb-2 text-xs text-muted">Recurrence</div>
          <RecurrenceForm
            seedDate={initialDate}
            resetKey={resetKey}
            seedRule={seed?.rule ?? null}
            onChange={handleRuleChange}
          />
        </div>
      </Modal.Body>
      <Modal.Footer>
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
          disabled={!canSubmit}
          className="cursor-pointer rounded border border-accent bg-accent/10 px-3 py-1.5 text-sm font-bold text-accent hover:bg-accent/20 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitVerb ?? "Add"}{" "}
          {dates.length > 0
            ? `${dates.length} ${dates.length === 1 ? "row" : "rows"}`
            : "rows"}
        </button>
      </Modal.Footer>
    </Modal>
  );
}
