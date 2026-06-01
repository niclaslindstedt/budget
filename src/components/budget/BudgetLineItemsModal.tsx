import { useMemo, useRef, useState } from "react";
import { Boxes, FileText, Plus, Trash2 } from "lucide-react";

import { findColumnByType, newId } from "../../data/sheet";
import type {
  Category,
  Column,
  EntryType,
  Item,
  LineItemLink,
  Row,
  Settings,
  Subtype,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useT } from "../../i18n";
import {
  formatAmountForInput,
  formatNumber,
  parseAmount,
  withCurrency,
} from "../../utils/format";
import { Button, ClearableInput, SignedAmountInput } from "../form";
import { ItemPicker } from "../ItemPicker";
import { Modal } from "../Modal";

// Per-line UI state. `amount` is the typed text (absolute, sign on
// `negative`) so the field can keep partial input mid-edit. Resolved to a
// signed number on save. Not persisted — every save mints fresh
// `LineItemLink` ids.
type LineDraft = {
  uiId: string;
  itemId: string | null;
  amount: string;
  negative: boolean;
  note: string;
};

// The amount typed for a line item is the item's purchase price, not a
// property of the link. The modal hands these back alongside the links so
// the host can write each onto its `Item` (`Item.purchasePrice`). The price
// is the absolute value of the typed amount (purchase prices are
// non-negative; the sign only drives the in-modal allocation maths).
export type ItemPriceUpdate = {
  itemId: string;
  purchasePrice: number;
};

type Props = {
  open: boolean;
  row: Row | null;
  columns: Column[];
  settings: Settings;
  items: readonly Item[];
  subtypes: readonly Subtype[];
  types: readonly EntryType[];
  categories: readonly Category[];
  onClose: () => void;
  // Fires on confirm with the full desired set of links (a replacement,
  // not a delta). An empty array clears the row's line items. The host
  // routes this to `setRowLineItems` or `linkLineItemsToHistoryEntry`
  // depending on the row kind. `itemPrices` carries the purchase price the
  // user typed for each linked item — the host writes each onto its `Item`
  // (the link no longer stores a price). `receiptPath` carries the
  // transaction's receipt reference alongside the links: an empty string
  // clears it, `undefined` leaves it untouched (e.g. when the receipt
  // section is not shown).
  onSubmit: (
    rowId: string,
    lineItems: LineItemLink[],
    itemPrices: ItemPriceUpdate[],
    receiptPath?: string,
  ) => void;
  // Receipt wiring. Present only on the standalone line-items flow (the
  // row "…" menu); absent in the embedded "Find items" usage, where the
  // whole receipt section is hidden. When `onUploadReceipt` is given but
  // `canUploadReceipt` is false (browser-localStorage backend), the
  // section shows a muted "switch backends" hint instead of the control.
  canUploadReceipt?: boolean;
  // Write the picked file to the backend (naming it from the
  // transaction's company / type / date, resolved by the host) and
  // resolve the stored receipt path. The file write is immediate; the
  // reference rides the normal save.
  onUploadReceipt?: (file: File) => Promise<string>;
  // Download the receipt at `path` and open it (new tab / preview).
  onViewReceipt?: (path: string) => Promise<void>;
  onCreateItem: (draft: Omit<Item, "id">) => Item;
  onCreateSubtype: (draft: Omit<Subtype, "id">) => Subtype;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

let nextUiId = 0;
function makeUiId(): string {
  nextUiId += 1;
  return `line-${nextUiId}`;
}

function makeEmptyLine(negative: boolean): LineDraft {
  return { uiId: makeUiId(), itemId: null, amount: "", negative, note: "" };
}

export function BudgetLineItemsModal({
  open,
  row,
  columns,
  settings,
  items,
  subtypes,
  types,
  categories,
  onClose,
  onSubmit,
  canUploadReceipt = false,
  onUploadReceipt,
  onViewReceipt,
  onCreateItem,
  onCreateSubtype,
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

  const description =
    descCol && row && typeof row.cells[descCol.id] === "string"
      ? (row.cells[descCol.id] as string)
      : "";
  const total =
    amountCol && row && typeof row.cells[amountCol.id] === "number"
      ? (row.cells[amountCol.id] as number)
      : 0;
  const totalNegative = total <= 0;

  const itemsById = useMemo(() => {
    const map = new Map<string, Item>();
    for (const it of items) map.set(it.id, it);
    return map;
  }, [items]);

  function seedLines(): LineDraft[] {
    const existing = row?.lineItems;
    if (existing && existing.length > 0) {
      return existing.map((l) => {
        // The price lives on the item now — seed the amount field from
        // the linked item's `purchasePrice` so editing stays consistent.
        const price = itemsById.get(l.itemId)?.purchasePrice;
        return {
          uiId: makeUiId(),
          itemId: l.itemId,
          amount:
            price === undefined || price === 0
              ? ""
              : formatAmountForInput(Math.abs(price), settings),
          negative: totalNegative,
          note: l.note ?? "",
        };
      });
    }
    return [makeEmptyLine(totalNegative)];
  }

  const [lines, setLines] = useState<LineDraft[]>(seedLines);
  // Receipt path committed alongside the links on confirm. The file is
  // written / read immediately against the backend; the reference rides
  // the normal save so a cancelled edit never leaves a dangling pointer
  // (a cancelled upload only orphans bytes). `undefined` after seeding
  // means "no receipt"; "" is never stored here (we drop straight to
  // undefined on remove).
  const [receiptPath, setReceiptPath] = useState<string | undefined>(
    row?.receiptPath,
  );
  const [receiptBusy, setReceiptBusy] = useState(false);
  const [receiptError, setReceiptError] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useResetOnOpen(open, row?.id, () => {
    setLines(seedLines());
    setReceiptPath(row?.receiptPath);
    setReceiptBusy(false);
    setReceiptError(false);
  });

  if (!open || !row) return null;

  function updateLine(uiId: string, patch: Partial<LineDraft>) {
    setLines((prev) =>
      prev.map((l) => (l.uiId === uiId ? { ...l, ...patch } : l)),
    );
  }

  function removeLine(uiId: string) {
    setLines((prev) => prev.filter((l) => l.uiId !== uiId));
  }

  function addLine() {
    setLines((prev) => [...prev, makeEmptyLine(totalNegative)]);
  }

  function toggleSign(uiId: string) {
    setLines((prev) =>
      prev.map((l) => (l.uiId === uiId ? { ...l, negative: !l.negative } : l)),
    );
  }

  // Resolve each line to a signed number (or null when blank).
  const resolved = lines.map((l) => {
    const abs = parseAmount(l.amount);
    const signed = abs === null ? null : l.negative ? -abs : abs;
    return { ...l, signed };
  });

  // A line counts when it names an item AND carries a numeric amount.
  const completed = resolved.filter(
    (l) => l.itemId !== null && l.signed !== null,
  );
  // Half-filled lines (item without amount, or amount without item) are a
  // validation error so the user doesn't silently lose them on save.
  const halfDone = resolved.some(
    (l) =>
      (l.itemId !== null && l.signed === null) ||
      (l.itemId === null && l.signed !== null),
  );

  const allocated = completed.reduce((acc, l) => acc + (l.signed ?? 0), 0);
  const remainder = total - allocated;
  const remainderSign = remainder > 0 ? "+" : remainder < 0 ? "−" : "";
  const remainderBody = withCurrency(
    formatNumber(Math.abs(remainder), settings, { neverAbbreviate: true }),
    settings,
  );
  // Surface an over-allocation explicitly: line items shouldn't exceed the
  // purchase, though we don't hard-block it (estimates, rounding).
  const overAllocated =
    total !== 0 && remainder !== 0 && Math.sign(remainder) !== Math.sign(total);

  const canSubmit = !halfDone;

  function handleSubmit() {
    if (!row || !canSubmit) return;
    const payload: LineItemLink[] = [];
    const itemPrices: ItemPriceUpdate[] = [];
    for (const l of completed) {
      const itemId = l.itemId as string;
      const link: LineItemLink = { id: newId(), itemId };
      const note = l.note.trim();
      if (note !== "") link.note = note;
      payload.push(link);
      // The typed amount is the item's purchase price (non-negative); the
      // sign only matters for the allocation maths above. The last line to
      // name a given item wins if it appears twice.
      itemPrices.push({ itemId, purchasePrice: Math.abs(l.signed ?? 0) });
    }
    // Empty string clears a previously-set receipt; only emit the
    // receipt argument when the section was available (otherwise leave
    // the field untouched by passing undefined).
    const receiptArg = onUploadReceipt ? (receiptPath ?? "") : undefined;
    onSubmit(row.id, payload, itemPrices, receiptArg);
  }

  async function handleFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    // Reset so picking the same file again still fires onChange.
    e.target.value = "";
    if (!file || !onUploadReceipt) return;
    setReceiptBusy(true);
    setReceiptError(false);
    try {
      const path = await onUploadReceipt(file);
      setReceiptPath(path);
    } catch {
      setReceiptError(true);
    } finally {
      setReceiptBusy(false);
    }
  }

  async function handleViewReceipt() {
    if (!receiptPath || !onViewReceipt) return;
    setReceiptError(false);
    try {
      await onViewReceipt(receiptPath);
    } catch {
      setReceiptError(true);
    }
  }

  const totalSign = total > 0 ? "+" : total < 0 ? "−" : "";
  const totalBody = withCurrency(
    formatNumber(Math.abs(total), settings, { neverAbbreviate: true }),
    settings,
  );
  const totalClass =
    total > 0 ? "text-positive" : total < 0 ? "text-negative" : "text-fg";

  const receiptName =
    receiptPath !== undefined && receiptPath !== ""
      ? (receiptPath.split("/").pop() ?? receiptPath)
      : null;

  return (
    <Modal
      open={open && !!row}
      onClose={onClose}
      labelledBy="line-items-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<Boxes size={14} aria-hidden focusable={false} />}
        title={t("items.lineItemsTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <p className="mb-3 text-sm text-muted">{t("items.lineItemsIntro")}</p>

        <div className="mb-4 rounded border border-line bg-surface-3 p-3">
          <div className="text-xs text-muted">{t("items.purchase")}</div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span className="truncate text-sm text-fg">
              {description || (
                <span className="italic text-muted">
                  {t("editEntry.description")}
                </span>
              )}
            </span>
            <span className={`font-mono text-sm tabular-nums ${totalClass}`}>
              {totalSign}
              {totalBody}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          {lines.map((l, i) => (
            <div
              key={l.uiId}
              className="rounded border border-line bg-surface-2 p-3"
            >
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs text-muted">
                  {t("items.lineN", { n: i + 1 })}
                </span>
                <button
                  type="button"
                  onClick={() => removeLine(l.uiId)}
                  aria-label={t("items.removeLine")}
                  title={t("items.removeLine")}
                  className="inline-flex cursor-pointer items-center justify-center border-0 bg-transparent p-1 text-muted hover:text-danger"
                >
                  <Trash2 size={14} aria-hidden focusable={false} />
                </button>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">{t("items.item")}</span>
                  <ItemPicker
                    items={items}
                    subtypes={subtypes}
                    types={types}
                    categories={categories}
                    selectedId={l.itemId}
                    onSelect={(id) => updateLine(l.uiId, { itemId: id })}
                    onCreateItem={onCreateItem}
                    onCreateSubtype={onCreateSubtype}
                    onCreateType={onCreateType}
                    onCreateCategory={onCreateCategory}
                  />
                </div>
                <label className="flex min-w-0 flex-col gap-1">
                  <span className="text-xs text-muted">
                    {t("items.lineAmount")}
                  </span>
                  <SignedAmountInput
                    value={l.amount}
                    negative={l.negative}
                    onValueChange={(next) =>
                      updateLine(l.uiId, { amount: next })
                    }
                    onToggleSign={() => toggleSign(l.uiId)}
                    settings={settings}
                    ariaLabel={t("items.lineAmount")}
                    surface="surface"
                  />
                </label>
                <label className="flex flex-col gap-1 sm:col-span-2">
                  <span className="text-xs text-muted">
                    {t("items.lineNote")}
                  </span>
                  <ClearableInput
                    value={l.note}
                    onValueChange={(next) => updateLine(l.uiId, { note: next })}
                    placeholder={t("items.lineNotePlaceholder")}
                    className="field-input w-full rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
                  />
                </label>
              </div>
            </div>
          ))}

          <button
            type="button"
            onClick={addLine}
            className="inline-flex cursor-pointer items-center gap-1 self-start rounded border border-dashed border-line bg-transparent px-3 py-1.5 text-sm text-muted hover:border-accent hover:text-accent"
          >
            <Plus size={14} aria-hidden focusable={false} />
            {t("items.addLine")}
          </button>

          <div
            className={`mt-1 rounded border p-3 ${
              remainder === 0
                ? "border-line bg-surface-3"
                : "border-accent/40 bg-accent/5"
            }`}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs text-muted">{t("items.remainder")}</span>
              {remainder === 0 ? (
                <span className="text-xs text-muted">
                  {t("items.remainderZero")}
                </span>
              ) : (
                <span
                  className={`font-mono text-sm tabular-nums ${
                    remainder > 0 ? "text-positive" : "text-negative"
                  }`}
                >
                  {remainderSign}
                  {remainderBody}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs text-muted">
              {overAllocated
                ? t("items.remainderOver")
                : t("items.remainderHint")}
            </p>
          </div>

          {onUploadReceipt && (
            <div className="flex flex-col gap-2 rounded border border-line bg-surface-3 p-3">
              <span className="text-xs text-muted">{t("items.receipt")}</span>
              {!canUploadReceipt ? (
                <p className="text-xs text-muted">
                  {t("items.receiptUnsupported")}
                </p>
              ) : (
                <>
                  {receiptName !== null && (
                    <div className="flex items-center gap-2">
                      <FileText
                        size={14}
                        aria-hidden
                        focusable={false}
                        className="shrink-0 text-muted"
                      />
                      <span className="min-w-0 flex-1 truncate text-sm text-fg">
                        {receiptName}
                      </span>
                      <button
                        type="button"
                        onClick={handleViewReceipt}
                        className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:border-accent hover:text-accent"
                      >
                        {t("items.receiptView")}
                      </button>
                      <button
                        type="button"
                        onClick={() => setReceiptPath(undefined)}
                        className="cursor-pointer rounded border border-line px-2 py-1 text-xs text-muted hover:border-danger hover:text-danger"
                      >
                        {t("items.receiptRemove")}
                      </button>
                    </div>
                  )}
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={handleFilePicked}
                    className="hidden"
                  />
                  <button
                    type="button"
                    disabled={receiptBusy}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex cursor-pointer items-center gap-1 self-start rounded border border-line px-2.5 py-1 text-xs text-muted hover:border-accent hover:text-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {receiptBusy
                      ? t("items.receiptUploading")
                      : receiptName !== null
                        ? t("items.receiptReplace")
                        : t("items.receiptUpload")}
                  </button>
                  {receiptError && (
                    <p className="text-xs text-danger">
                      {t("items.receiptError")}
                    </p>
                  )}
                </>
              )}
            </div>
          )}

          {halfDone && (
            <p className="text-xs text-danger">
              {t("items.needItemAndAmount")}
            </p>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit}
          title={canSubmit ? undefined : t("items.buttonDisabled")}
        >
          {t("items.button")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}
