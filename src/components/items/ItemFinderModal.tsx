import { useEffect, useMemo, useRef, useState } from "react";
import { Boxes, CopyX, Package, Plus, SkipForward, X } from "lucide-react";

import {
  findItemPurchaseCandidates,
  type ItemPurchaseCandidate,
} from "../../data/items/find";
import { synthesizeHistoryRow } from "../../data/budget/synthesis";
import { unlinkedItems } from "../../data/items/link";
import { normaliseDescription } from "../../data/description-normaliser";
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
import { useResetOnOpen, useToast } from "../../hooks";
import { useLang, useT } from "../../i18n";
import { indexById } from "../../utils/indexById";
import { formatAmount, formatDate } from "../../utils/format";
import {
  BudgetLineItemsModal,
  type ItemPriceUpdate,
} from "../budget/BudgetLineItemsModal";
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
  // Persist a "never suggest anything that looks like this" decision —
  // the candidate's resolved description, normalised to a match key, so
  // every similar charge (past + future) drops out of the scan.
  onExcludeSimilar: (description: string) => void;
  // Commit the user's line-item links for a history entry. Mirrors the
  // historic-row branch of `BudgetModalHost`'s `onLineItemsSubmit` —
  // routed by the host to `linkLineItemsToHistoryEntry`. `itemPrices`
  // carries the purchase price typed for each linked item; the host writes
  // each onto its `Item` (the link no longer stores a price).
  onLinkLineItems: (
    accountId: string,
    entryId: string,
    lineItems: LineItemLink[],
    itemPrices: ItemPriceUpdate[],
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

// How long the matching rows stay highlighted in red after "Exclude
// similar" before the dispatch sweeps them from the scan. Long enough
// to read which charges the pattern caught, short enough not to stall
// the queue. The CSS transition on the row colours is shorter so the
// red has faded in well before the timer fires.
const EXCLUDE_HIGHLIGHT_MS = 650;

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
  onExcludeSimilar,
  onLinkLineItems,
  onCreateItem,
  onCreateSubtype,
  onCreateType,
  onCreateCategory,
}: Props) {
  const t = useT();
  const lang = useLang();
  const toast = useToast();

  // The candidate list is recomputed whenever the modal opens (cheap —
  // a single pass over history). `skipped` is session-local: a skipped
  // entry drops out of the visible queue but reappears the next time the
  // modal is opened, unlike an ignored one which is persisted.
  const candidates = useMemo(
    () => (open ? findItemPurchaseCandidates(data, settings) : []),
    [open, data, settings],
  );
  const [skipped, setSkipped] = useState<ReadonlySet<string>>(new Set());
  // Entries whose line items the user just saved this session. The
  // scanner keeps an entry with existing line items in the candidate set
  // (a big purchase may have one item linked and more to add), so without
  // this the just-catalogued row reappears in the queue the moment the
  // line-items modal closes. Session-local like `skipped`: it drops the
  // row from the visible queue now but the entry resurfaces next time the
  // modal opens, so the user can keep adding items to it later.
  const [linked, setLinked] = useState<ReadonlySet<string>>(new Set());
  // The candidate whose line items are being edited, or null when the
  // embedded line-items modal is closed.
  const [editing, setEditing] = useState<ItemPurchaseCandidate | null>(null);
  // Entry ids the user just excluded-similar, held briefly so the rows
  // about to be swept flash red before the dispatch drops them from the
  // scan. Without this the matching rows vanish instantly and the user
  // never sees which charges the pattern caught.
  const [excluding, setExcluding] = useState<ReadonlySet<string>>(new Set());
  const excludeTimer = useRef<number | null>(null);
  // The description whose exclusion is mid-flight (highlighting). Held so
  // a second exclude click — or the modal closing — commits it instead of
  // dropping it on the floor when the timer is replaced.
  const pendingExclude = useRef<string | null>(null);

  // Commit an in-flight exclusion immediately and tear down its timer.
  // No-op when nothing is pending.
  const flushPendingExclude = () => {
    if (excludeTimer.current !== null) {
      window.clearTimeout(excludeTimer.current);
      excludeTimer.current = null;
    }
    if (pendingExclude.current !== null) {
      onExcludeSimilar(pendingExclude.current);
      pendingExclude.current = null;
    }
  };

  useResetOnOpen(open, undefined, () => {
    // Reopening with an exclusion still highlighting: commit it so the
    // pattern isn't silently dropped, then reset the session state.
    flushPendingExclude();
    setSkipped(new Set());
    setLinked(new Set());
    setEditing(null);
    setExcluding(new Set());
  });

  // Commit any pending exclusion on unmount so a closed modal doesn't
  // drop the user's decision.
  useEffect(
    () => () => {
      flushPendingExclude();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const typesById = useMemo(() => indexById(allTypes(data)), [data]);

  // Entries the user hasn't skipped or just catalogued this session and
  // that still match (the ignore decisions already dropped from
  // `candidates`). Skipping and saving line items are the session-local
  // filters applied on top.
  const queue = useMemo(
    () =>
      candidates.filter(
        (c) => !skipped.has(c.entryId) && !linked.has(c.entryId),
      ),
    [candidates, skipped, linked],
  );

  // Flash every queued row matching the candidate's normalised
  // description, then commit the exclusion once the highlight has read.
  const handleExcludeSimilar = (candidate: ItemPurchaseCandidate) => {
    // Commit any still-highlighting exclusion before starting a new one.
    flushPendingExclude();
    const key = normaliseDescription(candidate.description);
    const matches = new Set(
      queue
        .filter((c) => normaliseDescription(c.description) === key)
        .map((c) => c.entryId),
    );
    setExcluding(matches);
    toast.push({
      kind: "success",
      message: t("items.find.excludedToast"),
    });
    pendingExclude.current = candidate.description;
    excludeTimer.current = window.setTimeout(() => {
      onExcludeSimilar(candidate.description);
      pendingExclude.current = null;
      setExcluding(new Set());
      excludeTimer.current = null;
    }, EXCLUDE_HIGHLIGHT_MS);
  };

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
                  const isExcluding = excluding.has(c.entryId);
                  return (
                    <li
                      key={c.entryId}
                      className={`flex flex-col gap-2 rounded border px-3 py-2 transition sm:flex-row sm:items-center ${
                        isExcluding
                          ? "pointer-events-none border-danger/60 bg-danger/10 opacity-70"
                          : "border-line bg-surface"
                      }`}
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
                            {formatAmount(c.amount, settings, {
                              neverAbbreviate: true,
                            })}
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
                          className="inline-flex cursor-pointer items-center gap-1.5 rounded bg-accent px-3 py-1.5 text-xs font-bold text-page-bg hover:opacity-90"
                        >
                          <Plus size={13} aria-hidden focusable={false} />
                          {t("items.find.addLineItems")}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setSkipped((prev) => {
                              const next = new Set(prev);
                              next.add(c.entryId);
                              return next;
                            });
                            toast.push({
                              kind: "info",
                              message: t("items.find.skippedToast"),
                            });
                          }}
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
                          onClick={() => handleExcludeSimilar(c)}
                          aria-label={t("items.find.excludeSimilar")}
                          title={t("items.find.excludeSimilarHint")}
                          className="inline-flex h-7 w-7 cursor-pointer items-center justify-center rounded border border-line text-muted hover:border-danger hover:text-danger"
                        >
                          <CopyX size={12} aria-hidden focusable={false} />
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            onIgnore(c.entryId);
                            toast.push({
                              kind: "success",
                              message: t("items.find.ignoredToast"),
                            });
                          }}
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
        items={unlinkedItems(data, editingRow?.lineItems)}
        subtypes={data.subtypes}
        types={allTypes(data)}
        categories={allCategories(data)}
        onClose={() => setEditing(null)}
        onSubmit={(_rowId, lineItems, itemPrices) => {
          if (editing) {
            onLinkLineItems(
              editing.accountId,
              editing.entryId,
              lineItems,
              itemPrices,
            );
            // Drop the just-catalogued entry from the visible queue so it
            // doesn't reappear when the line-items modal closes.
            const entryId = editing.entryId;
            setLinked((prev) => {
              const next = new Set(prev);
              next.add(entryId);
              return next;
            });
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
