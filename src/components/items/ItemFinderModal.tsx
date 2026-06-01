import { useMemo, useState } from "react";
import { Boxes, Check, Package, SkipForward, X } from "lucide-react";

import {
  findItemPurchaseCandidates,
  type ItemPurchaseCandidate,
} from "../../data/items/find";
import { synthesizeHistoryRow } from "../../data/budget/synthesis";
import { createDefaultAccountBudget } from "../../data/sheet-types/budget";
import { allCategories, allTypes } from "../../data/presets/merge";
import type {
  Category,
  Column,
  EntryType,
  Item,
  LineItemLink,
  Settings,
  Subtype,
  UserData,
} from "../../data/types";
import { useResetOnOpen } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { indexById } from "../../utils/indexById";
import { formatAmount, formatDate } from "../../utils/format";
import { BudgetLineItemsModal } from "../budget/BudgetLineItemsModal";
import { TypeChip } from "../TypePicker";
import { Button } from "../form";
import { Modal } from "../Modal";

type Props = {
  open: boolean;
  data: UserData;
  settings: Settings;
  onClose: () => void;
  // Persist a "never suggest this entry again" decision.
  onIgnore: (entryId: string) => void;
  // Commit the user's line-item links for a history entry. Mirrors the
  // historic-row branch of `BudgetModalHost`'s `onLineItemsSubmit` —
  // routed by the host to `linkLineItemsToHistoryEntry`.
  onLinkLineItems: (
    accountId: string,
    entryId: string,
    lineItems: LineItemLink[],
  ) => void;
  // Item / taxonomy create-callbacks threaded straight to the embedded
  // line-items modal so the user can mint an `Item` (and its taxonomy)
  // inline while cataloguing a purchase.
  onCreateItem: (draft: Omit<Item, "id">) => Item;
  onCreateSubtype: (draft: Omit<Subtype, "id">) => Subtype;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
};

// Resolve the budget columns for the account a candidate's entry belongs
// to, so the embedded line-items modal can find the description / amount
// columns it reads. Falls back to a default budget layout when no budget
// sheet tracks the account (the columns only need the standard typed
// slots, which every default layout carries).
function columnsForAccount(data: UserData, accountId: string): Column[] {
  for (const sheet of data.sheets) {
    for (const item of sheet.items) {
      if (item.type === "accountBudget" && item.accountId === accountId) {
        return item.columns;
      }
    }
  }
  return createDefaultAccountBudget(accountId).columns;
}

// "Find items" walks the bank-history transactions that look like item
// purchases one at a time, letting the user catalogue each into owned
// `Item`s (add line items), leave it for next time (skip), or never see
// it again (ignore). Modelled on the post-import reconciliation flow:
// a scanned list the user clears decision by decision.
export function ItemFinderModal({
  open,
  data,
  settings,
  onClose,
  onIgnore,
  onLinkLineItems,
  onCreateItem,
  onCreateSubtype,
  onCreateType,
  onCreateCategory,
}: Props) {
  const t = useT();
  const lang = useLang();

  // The candidate list is recomputed whenever the modal opens (cheap —
  // a single pass over history). `skipped` is session-local: a skipped
  // entry drops out of the visible queue but reappears the next time the
  // modal is opened, unlike an ignored one which is persisted.
  const candidates = useMemo(
    () => (open ? findItemPurchaseCandidates(data, settings) : []),
    [open, data, settings],
  );
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  // The candidate whose line items are being edited, or null when the
  // embedded line-items modal is closed.
  const [editing, setEditing] = useState<ItemPurchaseCandidate | null>(null);

  useResetOnOpen(open, undefined, () => {
    setSkipped(new Set());
    setEditing(null);
  });

  const typesById = useMemo(() => indexById(allTypes(data)), [data]);

  // Entries the user hasn't skipped this session and that still match
  // (the ignore decisions already dropped from `candidates`). Skipping
  // is the only session-local filter applied on top.
  const queue = useMemo(
    () => candidates.filter((c) => !skipped.has(c.entryId)),
    [candidates, skipped],
  );

  if (!open) return null;

  const editingColumns = editing
    ? columnsForAccount(data, editing.accountId)
    : [];
  // Build the synthesized row the line-items modal edits. The entry is
  // resolved against the live history bucket so a concurrent edit isn't
  // acted on stale.
  const editingRow =
    editing &&
    (() => {
      const entries = data.history[editing.accountId] ?? [];
      const entry = entries.find((e) => e.id === editing.entryId);
      if (!entry) return null;
      const rows = synthesizeHistoryRow(
        entry,
        editingColumns,
        data.merchantHints,
        data.matchRules,
        data.companies,
        allTypes(data),
      );
      return rows[0] ?? null;
    })();

  return (
    <>
      <Modal
        open={open}
        onClose={onClose}
        labelledBy="find-items-title"
        size="max-w-2xl"
        centered={queue.length === 0}
      >
        <Modal.Header
          icon={<Package size={14} aria-hidden focusable={false} />}
          title={t("items.find.title")}
          onClose={onClose}
        />
        <Modal.Body>
          {queue.length === 0 ? (
            <p className="px-1 py-6 text-center text-sm text-muted">
              {t("items.find.empty")}
            </p>
          ) : (
            <>
              <p className="mb-3 text-sm text-muted">{t("items.find.intro")}</p>
              <ul className="flex flex-col gap-2">
                {queue.map((c) => {
                  const type =
                    c.typeId !== undefined
                      ? (typesById.get(c.typeId) ?? null)
                      : null;
                  return (
                    <li
                      key={c.entryId}
                      className="flex flex-col gap-2 rounded border border-line bg-surface px-3 py-2 sm:flex-row sm:items-center"
                    >
                      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <span className="truncate text-sm text-fg-bright">
                            {c.description}
                          </span>
                          <span
                            className={`font-mono text-xs tabular-nums ${
                              c.amount >= 0 ? "text-positive" : "text-negative"
                            }`}
                          >
                            {formatAmount(c.amount, settings)}
                          </span>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted">
                          <span className="font-mono text-path">
                            {formatDate(c.date, settings.dateFormat, lang)}
                          </span>
                          {type && (
                            <>
                              <span>·</span>
                              <TypeChip type={type} />
                            </>
                          )}
                          {c.existingLineItemCount > 0 && (
                            <>
                              <span>·</span>
                              <span className="inline-flex items-center gap-1">
                                <Boxes
                                  size={12}
                                  aria-hidden
                                  focusable={false}
                                />
                                {t("items.find.linkedCount", {
                                  n: c.existingLineItemCount,
                                })}
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="flex shrink-0 items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => setEditing(c)}
                          className="inline-flex cursor-pointer items-center gap-1 rounded border border-accent bg-accent/10 px-2.5 py-1 text-xs font-bold text-accent hover:bg-accent/20"
                        >
                          <Check size={12} aria-hidden focusable={false} />
                          {t("items.find.addLineItems")}
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setSkipped((prev) => {
                              const next = new Set(prev);
                              next.add(c.entryId);
                              return next;
                            })
                          }
                          aria-label={t("items.find.skip")}
                          title={t("items.find.skip")}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line text-muted hover:border-accent hover:text-accent"
                        >
                          <SkipForward
                            size={12}
                            aria-hidden
                            focusable={false}
                          />
                        </button>
                        <button
                          type="button"
                          onClick={() => onIgnore(c.entryId)}
                          aria-label={t("items.find.ignore")}
                          title={t("items.find.ignore")}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line text-muted hover:border-danger hover:text-danger"
                        >
                          <X size={12} aria-hidden focusable={false} />
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={onClose}>
            {t("common.close")}
          </Button>
        </Modal.Footer>
      </Modal>

      <BudgetLineItemsModal
        open={editing !== null && editingRow !== null}
        row={editingRow ?? null}
        columns={editingColumns}
        settings={settings}
        items={data.items}
        subtypes={data.subtypes}
        types={allTypes(data)}
        categories={allCategories(data)}
        onClose={() => setEditing(null)}
        onSubmit={(_rowId, lineItems) => {
          if (editing) {
            onLinkLineItems(editing.accountId, editing.entryId, lineItems);
          }
          setEditing(null);
        }}
        onCreateItem={onCreateItem}
        onCreateSubtype={onCreateSubtype}
        onCreateType={onCreateType}
        onCreateCategory={onCreateCategory}
      />
    </>
  );
}
