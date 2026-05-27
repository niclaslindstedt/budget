import { useMemo, useRef, useState } from "react";
import { Plus, RotateCcw, Split, Trash2 } from "lucide-react";

import { findColumnByType } from "../../data/sheet";
import type {
  Category,
  Column,
  EntryType,
  Row,
  Settings,
} from "../../data/types";
import { useDesktopAutoFocus, useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import {
  formatAmountForInput,
  formatNumber,
  parseAmount,
  withCurrency,
} from "../../utils/format";
import { Button, ClearableInput, SignedAmountInput } from "../form";
import { Modal } from "../Modal";
import { TypePicker } from "../TypePicker";

// Per-split UI state. `amount` is the typed text (absolute, sign lives
// on `negative`) so the field can keep partial input ("12,") while the
// user is mid-edit. Resolved to a signed number on save.
type SplitDraft = {
  // Stable React key. Not persisted — every save mints fresh rows in
  // the reducer.
  uiId: string;
  description: string;
  amount: string;
  negative: boolean;
  typeId: string | null;
};

export type { SplitSubmission } from "../../data/action-payloads";
import type { SplitSubmission } from "../../data/action-payloads";

type Props = {
  open: boolean;
  row: Row | null;
  columns: Column[];
  categories: readonly Category[];
  types: readonly EntryType[];
  settings: Settings;
  // Optional pre-fill for the splits list. Used when the row already
  // carries a saved split decomposition (e.g. a history entry whose
  // `splits` array was set on a previous pass) so the user can edit
  // the existing splits instead of starting from scratch. The parent
  // is responsible for translating from its persisted shape to this
  // submission shape. Empty array or undefined → start with one
  // blank split.
  initialSplits?: SplitSubmission[];
  // When set, the modal forces the splits + remainder to sum to this
  // exact value instead of `row.cells.amount`. Used for history rows
  // where the bank's amount is authoritative — the user can't change
  // the total, only how it's allocated. Defaults to reading from the
  // row's amount cell.
  authoritativeAmount?: number;
  // When set, the "Original" header card shows this label instead of
  // the row's description cell. Used for history split rows where the
  // clicked row carries the split's description, not the bank entry's.
  authoritativeDescription?: string;
  onClose: () => void;
  // Fires on confirm. `splits` is the (already-validated) list of new
  // rows; the reducer replaces the original at its position with these
  // and pushes the original (now carrying the remainder) to the end of
  // the list when `remainderAmount` is non-zero, or deletes it
  // entirely when the splits sum exactly to the original.
  onSplit: (
    rowId: string,
    splits: SplitSubmission[],
    remainderAmount: number,
  ) => void;
  // Optional revert action. When provided AND `initialSplits` is
  // non-empty, the footer shows a "Revert split" button that clears
  // the persisted decomposition. The parent decides what reverting
  // means for its row kind (history entries drop the `splits` field
  // off the bank record; the synthesizer then falls back to a single
  // row).
  onRevert?: (rowId: string) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

let nextUiId = 0;
function makeUiId(): string {
  nextUiId += 1;
  return `split-${nextUiId}`;
}

function makeEmptySplit(negative: boolean): SplitDraft {
  return {
    uiId: makeUiId(),
    description: "",
    amount: "",
    negative,
    typeId: null,
  };
}

export function BudgetSplitEntryModal({
  open,
  row,
  columns,
  categories,
  types,
  settings,
  initialSplits,
  authoritativeAmount,
  authoritativeDescription,
  onClose,
  onSplit,
  onRevert,
  onCreateType,
  onCreateCategory,
}: Props) {
  const t = useT();

  const descCol = useMemo(
    () => findColumnByType(columns, "description"),
    [columns],
  );
  const amountCol = useMemo(
    () => findColumnByType(columns, "amount"),
    [columns],
  );

  const cellDescription =
    descCol && row && typeof row.cells[descCol.id] === "string"
      ? (row.cells[descCol.id] as string)
      : "";
  const originalDescription = authoritativeDescription ?? cellDescription;
  const cellAmount =
    amountCol && row && typeof row.cells[amountCol.id] === "number"
      ? (row.cells[amountCol.id] as number)
      : 0;
  // History rows pass an authoritative amount that overrides the
  // visible cell (which on an already-split row shows the first
  // split's amount, not the entry's bank total).
  const originalAmount = authoritativeAmount ?? cellAmount;
  // Splits inherit the original's sign by default so a typical expense
  // split stays an expense without the user having to toggle every row.
  const originalNegative = originalAmount <= 0;

  // Convert a pre-filled split into the modal's draft shape. The
  // input amount uses the absolute value with the sign on a toggle.
  function draftFromSubmission(s: SplitSubmission): SplitDraft {
    return {
      uiId: makeUiId(),
      description: s.description,
      amount:
        s.amount === 0
          ? ""
          : formatAmountForInput(Math.abs(s.amount), settings),
      negative: s.amount < 0 || (s.amount === 0 && originalNegative),
      typeId: s.typeId,
    };
  }

  function seedSplits(): SplitDraft[] {
    if (initialSplits && initialSplits.length > 0) {
      return initialSplits.map(draftFromSubmission);
    }
    return [makeEmptySplit(originalNegative)];
  }

  const [splits, setSplits] = useState<SplitDraft[]>(seedSplits);
  const firstFieldRef = useRef<HTMLInputElement>(null);
  useDesktopAutoFocus(firstFieldRef, open && !!row, row?.id);

  // Reset every time a new row drives the modal so the previous edit
  // doesn't leak in. Resetting on `open` alone would skip the case
  // where the user closes and re-opens against the same row, hence the
  // row id dependency.
  useResetOnOpen(open, row?.id, () => {
    setSplits(seedSplits());
  });

  if (!open || !row) return null;

  function updateSplit(uiId: string, patch: Partial<SplitDraft>) {
    setSplits((prev) =>
      prev.map((s) => (s.uiId === uiId ? { ...s, ...patch } : s)),
    );
  }

  function removeSplit(uiId: string) {
    setSplits((prev) =>
      prev.length <= 1 ? prev : prev.filter((s) => s.uiId !== uiId),
    );
  }

  function addSplit() {
    setSplits((prev) => [...prev, makeEmptySplit(originalNegative)]);
  }

  function toggleSign(uiId: string) {
    setSplits((prev) =>
      prev.map((s) => (s.uiId === uiId ? { ...s, negative: !s.negative } : s)),
    );
  }

  // Resolve each split to a signed number (or null when blank).
  const resolvedSplits = splits.map((s) => {
    const trimmedDesc = s.description.trim();
    const abs = parseAmount(s.amount);
    const signed = abs === null ? null : s.negative ? -abs : abs;
    return { ...s, trimmedDesc, signed };
  });

  // A split counts if it has both a non-empty description and a numeric
  // amount. Half-filled splits (just description or just amount) are
  // surfaced as a validation error so the user doesn't silently lose
  // them on save.
  const completed = resolvedSplits.filter(
    (s) => s.trimmedDesc !== "" && s.signed !== null,
  );
  const halfDone = resolvedSplits.some(
    (s) =>
      (s.trimmedDesc !== "" && s.signed === null) ||
      (s.trimmedDesc === "" && s.signed !== null),
  );

  const splitsSum = completed.reduce((acc, s) => acc + (s.signed ?? 0), 0);
  const remainderAmount = originalAmount - splitsSum;
  // Display in absolute terms with an explicit sign prefix so the
  // remainder reads consistently regardless of the original's direction.
  const remainderSign =
    remainderAmount > 0 ? "+" : remainderAmount < 0 ? "−" : "";
  const remainderBody = withCurrency(
    formatNumber(Math.abs(remainderAmount), settings),
    settings,
  );
  // When the remainder ends up on the opposite side of zero from the
  // original (e.g. an expense split into a larger expense + something
  // else), the leftover row will flip sign — surface that explicitly.
  const remainderFlipped =
    remainderAmount !== 0 &&
    originalAmount !== 0 &&
    Math.sign(remainderAmount) !== Math.sign(originalAmount);

  const canSubmit = completed.length > 0 && !halfDone;

  function handleSubmit() {
    if (!row || !canSubmit) return;
    const payload: SplitSubmission[] = completed.map((s) => ({
      description: s.trimmedDesc,
      amount: s.signed ?? 0,
      typeId: s.typeId,
    }));
    onSplit(row.id, payload, remainderAmount);
  }

  // Only meaningful when the modal was opened against an already-split
  // entry (i.e. `initialSplits` was provided). Surfaces a revert action
  // so the user can drop the persisted decomposition without having to
  // delete each split row by hand.
  const canRevert = !!onRevert && !!initialSplits && initialSplits.length > 0;

  const originalSign = originalAmount > 0 ? "+" : originalAmount < 0 ? "−" : "";
  const originalBody = withCurrency(
    formatNumber(Math.abs(originalAmount), settings),
    settings,
  );
  const originalAmountClass =
    originalAmount > 0
      ? "text-positive"
      : originalAmount < 0
        ? "text-negative"
        : "text-fg";

  return (
    <Modal
      open={open && !!row}
      onClose={onClose}
      labelledBy="split-entry-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<Split size={14} aria-hidden focusable={false} />}
        title={t("splitRow.title")}
        onClose={onClose}
      />
      <Modal.Body>
        <p className="mb-3 text-sm text-muted">{t("splitRow.intro")}</p>

        <div className="mb-4 rounded border border-line bg-surface-3 p-3">
          <div className="text-xs text-muted">{t("splitRow.original")}</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="truncate text-sm text-fg">
              {originalDescription || (
                <span className="italic text-muted">
                  {t("editEntry.description")}
                </span>
              )}
            </span>
            <span
              className={`font-mono text-sm tabular-nums ${originalAmountClass}`}
            >
              {originalSign}
              {originalBody}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {splits.map((s, i) => {
            return (
              <div
                key={s.uiId}
                className="rounded border border-line bg-surface-2 p-3"
              >
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs text-muted">
                    {t("splitRow.splitN", { n: i + 1 })}
                  </span>
                  <button
                    type="button"
                    onClick={() => removeSplit(s.uiId)}
                    disabled={splits.length <= 1}
                    aria-label={t("splitRow.removeSplit")}
                    title={t("splitRow.removeSplit")}
                    className="inline-flex cursor-pointer items-center justify-center border-0 bg-transparent p-1 text-muted hover:text-danger disabled:cursor-not-allowed disabled:opacity-30"
                  >
                    <Trash2 size={14} aria-hidden focusable={false} />
                  </button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="flex flex-col gap-1 sm:col-span-2">
                    <span className="text-xs text-muted">
                      {t("splitRow.description")}
                    </span>
                    <ClearableInput
                      ref={i === 0 ? firstFieldRef : undefined}
                      value={s.description}
                      onValueChange={(next) =>
                        updateSplit(s.uiId, { description: next })
                      }
                      placeholder={t("splitRow.descriptionPlaceholder")}
                      className="field-input w-full rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
                    />
                  </label>
                  <label className="flex min-w-0 flex-col gap-1">
                    <span className="text-xs text-muted">
                      {t("splitRow.amount")}
                    </span>
                    <SignedAmountInput
                      value={s.amount}
                      negative={s.negative}
                      onValueChange={(next) =>
                        updateSplit(s.uiId, { amount: next })
                      }
                      onToggleSign={() => toggleSign(s.uiId)}
                      settings={settings}
                      ariaLabel={t("splitRow.amount")}
                      surface="surface"
                    />
                  </label>
                  <div className="flex flex-col gap-1">
                    <span className="text-xs text-muted">
                      {t("splitRow.type")}
                    </span>
                    <TypePicker
                      variant="field"
                      types={types}
                      categories={categories}
                      selectedId={s.typeId}
                      onSelect={(id) => updateSplit(s.uiId, { typeId: id })}
                      onCreate={onCreateType}
                      onCreateCategory={onCreateCategory}
                    />
                  </div>
                </div>
              </div>
            );
          })}

          <button
            type="button"
            onClick={addSplit}
            className="inline-flex cursor-pointer items-center gap-1 self-start rounded border border-dashed border-line bg-transparent px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
          >
            <Plus size={14} aria-hidden focusable={false} />
            {t("splitRow.addSplit")}
          </button>

          <div
            className={`mt-1 rounded border p-3 ${
              remainderAmount === 0
                ? "border-line bg-surface-3"
                : "border-accent/40 bg-accent/5"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">
                {t("splitRow.remainder")}
              </span>
              {remainderAmount === 0 ? (
                <span className="text-xs text-muted">
                  {t("splitRow.remainderZero")}
                </span>
              ) : (
                <span
                  className={`font-mono text-sm tabular-nums ${
                    remainderAmount > 0 ? "text-positive" : "text-negative"
                  }`}
                >
                  {remainderSign}
                  {remainderBody}
                </span>
              )}
            </div>
            {remainderAmount !== 0 && (
              <p className="mt-1.5 text-xs text-muted">
                {remainderFlipped
                  ? t("splitRow.remainderOpposite")
                  : t("splitRow.remainderHint")}
              </p>
            )}
          </div>

          {halfDone && (
            <p className="text-xs text-danger">
              {t("splitRow.needDescAndAmount")}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        {canRevert && (
          <button
            type="button"
            onClick={() => {
              if (row && onRevert) onRevert(row.id);
            }}
            title={t("splitRow.revertTitle")}
            className="mr-auto inline-flex cursor-pointer items-center gap-1.5 rounded border border-line px-3 py-1.5 text-sm text-muted hover:border-danger hover:text-danger"
          >
            <RotateCcw size={14} aria-hidden focusable={false} />
            {t("splitRow.revert")}
          </button>
        )}
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          title={canSubmit ? undefined : t("splitRow.buttonDisabled")}
        >
          {t("splitRow.button")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
