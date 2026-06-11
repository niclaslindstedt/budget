import { useMemo, useState } from "react";
import { Boxes, Plus, Trash2, X } from "lucide-react";

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
import { SubtypePicker } from "../SubtypePicker";
import { TypeChip } from "../TypePicker";

// Per-line UI state. `amount` is the typed text (absolute, sign on
// `negative`) so the field can keep partial input mid-edit. Resolved to a
// signed number on save. Not persisted — every save mints fresh
// `LineItemLink` ids.
//
// Cataloguing a fresh purchase almost always means the item doesn't
// exist yet, so the primary control is the `name` input — typing a name
// creates a new `Item` on save. Picking an existing item (the
// PackageSearch button beside the input) fills `itemId` + mirrors the
// item's name into the input; editing the name again clears `itemId`
// back to create-new mode.
type LineDraft = {
  uiId: string;
  // The existing owned item this line links to, or null when the line
  // creates a new item from `name` on save.
  itemId: string | null;
  name: string;
  // Classification for the inline-created item: a picked subtype id, or
  // — in "create" mode — a new subtype name filed under the
  // transaction's type on save. Ignored when `itemId` is set (an
  // existing item already carries its own classification).
  subtypeId: string | null;
  subtypeMode: "pick" | "create";
  newSubtypeName: string;
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
  // (the link no longer stores a price). The transaction's receipt is no
  // longer edited here: it's managed from the linked item's "…" menu on the
  // Items sheet, so this submit never touches `receiptPath`.
  onSubmit: (
    rowId: string,
    lineItems: LineItemLink[],
    itemPrices: ItemPriceUpdate[],
  ) => void;
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
  return {
    uiId: makeUiId(),
    itemId: null,
    name: "",
    subtypeId: null,
    subtypeMode: "pick",
    newSubtypeName: "",
    amount: "",
    negative,
    note: "",
  };
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
        const item = itemsById.get(l.itemId);
        const price = item?.purchasePrice;
        return {
          uiId: makeUiId(),
          itemId: l.itemId,
          name: item?.name ?? "",
          subtypeId: null,
          subtypeMode: "pick" as const,
          newSubtypeName: "",
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

  // The transaction's resolved type — pre-picked as the new item's type
  // so the user only chooses (or types) a subtype. Scopes the subtype
  // dropdown and anchors inline subtype creation. Null when the row has
  // no type (or a dangling id): the subtype dropdown then falls back to
  // the full list with its own creator.
  const txnType = useMemo(
    () =>
      row?.typeId !== undefined
        ? (types.find((ty) => ty.id === row.typeId) ?? null)
        : null,
    [types, row],
  );
  const scopedSubtypes = useMemo(
    () =>
      txnType !== null
        ? subtypes.filter((s) => s.typeId === txnType.id)
        : subtypes,
    [subtypes, txnType],
  );

  useResetOnOpen(open, row?.id, () => {
    setLines(seedLines());
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

  // A line counts when it names an item — an existing one picked, or a
  // new name typed — AND carries a numeric amount.
  const completed = resolved.filter(
    (l) => (l.itemId !== null || l.name.trim() !== "") && l.signed !== null,
  );
  // Half-filled lines (item without amount, or amount without item) are a
  // validation error so the user doesn't silently lose them on save.
  const halfDone = resolved.some((l) => {
    const hasItem = l.itemId !== null || l.name.trim() !== "";
    return (hasItem && l.signed === null) || (!hasItem && l.signed !== null);
  });

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
    // Subtypes minted during this save, keyed by lower-cased name, so
    // two lines typing the same new subtype share one record.
    const createdSubtypeIds = new Map<string, string>();
    for (const l of completed) {
      let itemId = l.itemId;
      if (itemId === null) {
        // Inline creation: the typed name becomes a fresh `Item`,
        // classified under the picked / typed subtype (which files
        // under the transaction's pre-picked type).
        const draft: Omit<Item, "id"> = { name: l.name.trim() };
        let subtypeId = l.subtypeId ?? undefined;
        const newSubtypeName = l.newSubtypeName.trim();
        if (
          l.subtypeMode === "create" &&
          newSubtypeName !== "" &&
          txnType !== null
        ) {
          // Reuse an existing subtype with the same name under the
          // type rather than minting a duplicate.
          const key = newSubtypeName.toLowerCase();
          const existing = scopedSubtypes.find(
            (s) => s.name.trim().toLowerCase() === key,
          );
          subtypeId = existing?.id ?? createdSubtypeIds.get(key);
          if (subtypeId === undefined) {
            const created = onCreateSubtype({
              name: newSubtypeName,
              typeId: txnType.id,
            });
            createdSubtypeIds.set(key, created.id);
            subtypeId = created.id;
          }
        }
        if (subtypeId !== undefined) draft.subtypeId = subtypeId;
        itemId = onCreateItem(draft).id;
      }
      const link: LineItemLink = { id: newId(), itemId };
      const note = l.note.trim();
      if (note !== "") link.note = note;
      payload.push(link);
      // The typed amount is the item's purchase price (non-negative); the
      // sign only matters for the allocation maths above. The last line to
      // name a given item wins if it appears twice.
      itemPrices.push({ itemId, purchasePrice: Math.abs(l.signed ?? 0) });
    }
    onSubmit(row.id, payload, itemPrices);
  }

  const totalSign = total > 0 ? "+" : total < 0 ? "−" : "";
  const totalBody = withCurrency(
    formatNumber(Math.abs(total), settings, { neverAbbreviate: true }),
    settings,
  );
  const totalClass =
    total > 0 ? "text-positive" : total < 0 ? "text-negative" : "text-fg";

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
                  <div className="flex min-w-0 items-stretch gap-1.5">
                    <div className="min-w-0 flex-1">
                      <ClearableInput
                        value={l.name}
                        onValueChange={(next) =>
                          updateLine(l.uiId, { name: next, itemId: null })
                        }
                        placeholder={t("items.itemNamePlaceholder")}
                        className="field-input w-full rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
                      />
                    </div>
                    <ItemPicker
                      variant="icon"
                      allowCreate={false}
                      items={items}
                      subtypes={subtypes}
                      types={types}
                      categories={categories}
                      selectedId={l.itemId}
                      onSelect={(id) => {
                        const picked =
                          id !== null ? itemsById.get(id) : undefined;
                        updateLine(l.uiId, {
                          itemId: id,
                          name: picked?.name ?? "",
                        });
                      }}
                      onCreateItem={onCreateItem}
                      onCreateSubtype={onCreateSubtype}
                      onCreateType={onCreateType}
                      onCreateCategory={onCreateCategory}
                      placeholder={t("items.pickExisting")}
                    />
                  </div>
                  {l.itemId !== null && (
                    <span className="text-[11px] text-muted">
                      {t("items.existingItemSelected")}
                    </span>
                  )}
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
                {l.itemId === null && l.name.trim() !== "" && (
                  <div className="flex min-w-0 flex-col gap-1 sm:col-span-2">
                    <span className="inline-flex items-center gap-2 text-xs text-muted">
                      {t("items.subtypeOptional")}
                      {txnType !== null && <TypeChip type={txnType} />}
                    </span>
                    {l.subtypeMode === "pick" ? (
                      <div className="flex min-w-0 items-stretch gap-1.5">
                        <div className="min-w-0 flex-1">
                          <SubtypePicker
                            subtypes={scopedSubtypes}
                            types={types}
                            categories={categories}
                            selectedId={l.subtypeId}
                            onSelect={(id) =>
                              updateLine(l.uiId, { subtypeId: id })
                            }
                            onCreate={onCreateSubtype}
                            onCreateType={onCreateType}
                            onCreateCategory={onCreateCategory}
                            fixedParentTypeId={txnType?.id}
                            allowCreate={txnType === null}
                          />
                        </div>
                        {txnType !== null && (
                          <button
                            type="button"
                            onClick={() =>
                              updateLine(l.uiId, {
                                subtypeMode: "create",
                                subtypeId: null,
                              })
                            }
                            aria-label={t("items.newSubtype")}
                            title={t("items.newSubtype")}
                            className="inline-flex w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-accent hover:text-accent"
                          >
                            <Plus size={14} aria-hidden focusable={false} />
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex min-w-0 items-stretch gap-1.5">
                        <div className="min-w-0 flex-1">
                          <ClearableInput
                            value={l.newSubtypeName}
                            onValueChange={(next) =>
                              updateLine(l.uiId, { newSubtypeName: next })
                            }
                            placeholder={t("items.subtypeNamePlaceholder")}
                            className="field-input w-full rounded border border-line bg-surface px-2 py-1.5 text-sm text-fg"
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            updateLine(l.uiId, {
                              subtypeMode: "pick",
                              newSubtypeName: "",
                            })
                          }
                          aria-label={t("common.cancel")}
                          title={t("common.cancel")}
                          className="inline-flex w-9 shrink-0 cursor-pointer items-center justify-center rounded border border-line bg-surface text-muted hover:border-danger hover:text-danger"
                        >
                          <X size={14} aria-hidden focusable={false} />
                        </button>
                      </div>
                    )}
                  </div>
                )}
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
