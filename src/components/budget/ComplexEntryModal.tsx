import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Sigma } from "lucide-react";

import { formulaToStored, parseFormula } from "../../data/formula";
import type { RecurrenceRule } from "../../data/recurrence";
import type { Category, EntryType, Settings, Sheet } from "../../data/types";
import { useT } from "../../i18n";
import { normalizeAmountInput, parseAmount } from "../../utils/format";
import { Button, ClearableInput, SignedAmountInput } from "../form";
import { FormulaHelpButton } from "./FormulaHelpButton";
import { FormulaInput, type FormulaInputHandle } from "./FormulaInput";
import { FormulaVariableHelper } from "./FormulaVariableHelper";
import { Modal } from "../Modal";
import { RecurrenceForm } from "./RecurrenceForm";
import { TypePicker } from "../TypePicker";

type Props = {
  open: boolean;
  initialDate: string;
  categories: Category[];
  types: readonly EntryType[];
  settings: Settings;
  // All sheets in the workspace. Used by the formula editor's
  // autocomplete (sheet name suggestions) and the name ↔ id transform
  // on submit (`formulaToStored`) so the persisted form always holds
  // stable sheet ids.
  sheets: readonly Sheet[];
  // The sheet the new entry is being added to. Used by the formula
  // helper to hide the current sheet from the "other sheets" cross-
  // reference section — the bare variable forms (`endOfMonthBalance`,
  // …) already mean "this sheet's value", so a redundant per-sheet
  // entry would just clutter the dropdown.
  currentSheetId?: string | null;
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
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

export type ComplexEntrySeed = {
  description: string;
  // Signed: negative seeds the sign toggle as "−"; positive as "+".
  amount: number;
  typeId: string | null;
  rule: import("../../data/recurrence").RecurrenceRule | null;
};

export type { ComplexEntryDraft } from "../../data/action-payloads";
import type { ComplexEntryDraft } from "../../data/action-payloads";

export function ComplexEntryModal({
  open,
  initialDate,
  categories,
  types,
  settings,
  sheets,
  currentSheetId,
  seed,
  title,
  submitVerb,
  onClose,
  onCreate,
  onCreateType,
  onCreateCategory,
}: Props) {
  const t = useT();
  const [description, setDescription] = useState("");
  const [amountText, setAmountText] = useState("");
  const [negative, setNegative] = useState(true);
  const [typeId, setTypeId] = useState<string | null>(null);
  const [dates, setDates] = useState<string[]>([]);
  // fx mode swaps the numeric amount input for a formula textarea
  // (`endOfMonthBalance - 5000`, `sheet("Wife", endOfMonthBalance)`, …).
  // The displayed text shows sheet **names** for readability; on
  // submit, `formulaToStored` rewrites them to stable sheet ids so
  // renames don't break the formula.
  const [formulaMode, setFormulaMode] = useState(false);
  const [formulaText, setFormulaText] = useState("");
  // Lets the variable-helper dropdown splice tokens at the caret and
  // restore focus + cursor position afterwards. The FormulaInput is a
  // contentEditable pill renderer so the ref points at its imperative
  // handle, not a raw DOM input.
  const formulaInputRef = useRef<FormulaInputHandle>(null);
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
      setTypeId(seed.typeId);
    } else {
      setDescription("");
      setAmountText("");
      setNegative(true);
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

  const toggleSign = () => setNegative((s) => !s);
  const toggleFormulaMode = () => setFormulaMode((m) => !m);

  const insertFormulaToken = useCallback((text: string) => {
    // FormulaInput owns its own caret model (text-offset, not DOM
    // selection) and handles the "drop caret into first hole"
    // post-insert reposition internally. We just forward the snippet.
    formulaInputRef.current?.insertAtCaret(text);
  }, []);

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
      <Modal.Header
        icon={<Sigma size={14} aria-hidden focusable={false} />}
        title={title ?? t("complex.titleNew")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 sm:col-span-2">
            <span className="text-xs text-muted">
              {t("complex.description")}
            </span>
            <ClearableInput
              value={description}
              onValueChange={setDescription}
              className="field-input w-full min-w-0 rounded border border-line bg-surface-2 px-2 py-1.5 text-sm text-fg"
              placeholder={t("complex.descriptionPlaceholder")}
            />
          </label>
          {/* Not a <label>: the fx toggle button is labelable, so wrapping
              the formula input in a <label> makes a tap on the formula
              field activate the fx button instead and toggle the mode off. */}
          <div
            className={`flex flex-col gap-1${formulaMode ? " sm:col-span-2" : ""}`}
          >
            <span className="flex items-center justify-between text-xs text-muted">
              <span>{t("complex.amount")}</span>
              <button
                type="button"
                onClick={toggleFormulaMode}
                aria-pressed={formulaMode}
                title={
                  formulaMode
                    ? t("complex.fxSwitchToFixed")
                    : t("complex.fxUseFormula")
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
                <FormulaInput
                  ref={formulaInputRef}
                  value={formulaText}
                  onChange={setFormulaText}
                  placeholder={t("complex.formulaPlaceholder")}
                  ariaLabel={t("complex.amountFormula")}
                  className="formula-input field-input flex-1 rounded border border-line bg-surface-2 px-2 py-1.5 font-mono text-sm text-fg"
                />
                <FormulaVariableHelper
                  onInsert={insertFormulaToken}
                  sheets={sheets}
                  currentSheetId={currentSheetId ?? null}
                />
                <FormulaHelpButton />
              </div>
            ) : (
              <SignedAmountInput
                value={amountText}
                negative={negative}
                onValueChange={setAmountText}
                onToggleSign={toggleSign}
                settings={settings}
                ariaLabel={t("complex.amount")}
                placeholder={t("complex.amountPlaceholder")}
              />
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
                {t("complex.formulaEvaluatedHint")}
              </span>
            ) : null}
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs text-muted">{t("complex.type")}</span>
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

        <div className="mt-5">
          <div className="mb-2 text-xs text-muted">
            {t("complex.recurrence")}
          </div>
          <RecurrenceForm
            seedDate={initialDate}
            resetKey={resetKey}
            seedRule={seed?.rule ?? null}
            onChange={handleRuleChange}
          />
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
          {submitVerb ?? t("complex.addVerb")}{" "}
          {dates.length > 0
            ? dates.length === 1
              ? t("complex.rowOne", { n: dates.length })
              : t("complex.rowOther", { n: dates.length })
            : t("complex.rowsPlaceholder")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
