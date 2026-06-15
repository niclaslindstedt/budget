import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeftRight,
  Check,
  Copy,
  Info,
  Receipt,
  Repeat,
} from "lucide-react";

import type {
  Category,
  Column,
  Company,
  EntryType,
  HistoryEntry,
  Item,
  Row,
  Settings,
  Tag,
} from "../../data/types";
import { unlock as unlockAchievement } from "../../data/achievements";
import { getStandardColumns } from "../../data/sheet";
import { useLang, useT } from "../../i18n";
import { formatAmount, formatDate } from "../../utils/format";
import { CategoryIconGlyph } from "../icons";
import { Modal } from "../Modal";
import { Button } from "../form";

type Props = {
  open: boolean;
  onClose: () => void;
  // The row to describe. Null while the modal is closed.
  row: Row | null;
  columns: readonly Column[];
  // The backing bank entry — populated by the host only for `historic`
  // rows, so the modal can surface the raw bank text, running balance,
  // import timestamp, and splits the synthesized row doesn't carry.
  entry: HistoryEntry | null;
  // Taxonomy lists used to resolve the row's id references to display
  // names / glyphs. Passed as arrays the modal indexes once.
  types: readonly EntryType[];
  categories: readonly Category[];
  companies: readonly Company[];
  tags: readonly Tag[];
  items: readonly Item[];
  settings: Settings;
};

// Read-only modal that lays out every field of a budget or imported
// history row, with a copy glyph beside each copyable value plus a
// "copy all" button that lifts the whole entry (description, amount,
// type, …) onto the clipboard as plain text. Opened from the info
// action button (left of the edit pen) and the row's "…" menu.
export function BudgetEntryInfoModal({
  open,
  onClose,
  row,
  columns,
  entry,
  types,
  categories,
  companies,
  tags,
  items,
  settings,
}: Props) {
  const t = useT();
  const lang = useLang();

  const typesById = useMemo(
    () => new Map(types.map((x) => [x.id, x])),
    [types],
  );
  const categoriesById = useMemo(
    () => new Map(categories.map((x) => [x.id, x])),
    [categories],
  );
  const companiesById = useMemo(
    () => new Map(companies.map((x) => [x.id, x])),
    [companies],
  );
  const tagsById = useMemo(() => new Map(tags.map((x) => [x.id, x])), [tags]);
  const itemsById = useMemo(
    () => new Map(items.map((x) => [x.id, x])),
    [items],
  );

  // Resolve the displayed primitives once `row` is non-null. Kept inside
  // a memo guarded on `row` so the hooks above always run in the same
  // order regardless of open state.
  const view = useMemo(() => {
    if (!row) return null;
    const { dateCol, descCol, amountCol } = getStandardColumns(columns);
    const dateIso =
      dateCol && typeof row.cells[dateCol.id] === "string"
        ? (row.cells[dateCol.id] as string)
        : "";
    const description =
      descCol && typeof row.cells[descCol.id] === "string"
        ? (row.cells[descCol.id] as string)
        : "";
    const amount =
      amountCol && typeof row.cells[amountCol.id] === "number"
        ? (row.cells[amountCol.id] as number)
        : null;
    const type = row.typeId ? (typesById.get(row.typeId) ?? null) : null;
    const category = type
      ? (categoriesById.get(type.categoryId) ?? null)
      : null;
    const company = row.companyId
      ? (companiesById.get(row.companyId) ?? null)
      : null;
    const rowTags = (row.tagIds ?? [])
      .map((id) => tagsById.get(id))
      .filter((x): x is Tag => x !== undefined);
    // The raw bank text only differs from the resolved description when
    // the user (or a rule / hint) relabelled the row; show it when it
    // adds information.
    const bankDescription =
      entry &&
      entry.description.trim() !== "" &&
      entry.description !== description
        ? entry.description
        : null;
    const rowLineItems = (row.lineItems ?? []).map((li) => ({
      id: li.id,
      name: itemsById.get(li.itemId)?.name ?? t("cell.unknownItem"),
    }));
    return {
      dateIso,
      description,
      amount,
      type,
      category,
      company,
      rowTags,
      bankDescription,
      rowLineItems,
    };
  }, [
    row,
    columns,
    entry,
    typesById,
    categoriesById,
    companiesById,
    tagsById,
    itemsById,
    t,
  ]);

  if (!row || !view) return null;

  const none = t("budget.entryInfoNone");
  const dateText = view.dateIso
    ? formatDate(view.dateIso, settings.dateFormat, lang)
    : none;
  const amountText =
    view.amount !== null ? formatAmount(view.amount, settings) : none;
  const kindLabel =
    row.kind === "historic"
      ? t("budget.entryInfoKindHistory")
      : t("budget.entryInfoKindUser");
  const typeText = view.type
    ? view.type.name
    : t("budget.entryInfoUncategorized");

  // Plain-text dump used by the "copy all" button: one `Label: value`
  // line per populated field, in the same order as the rows below.
  // Cheap to rebuild on render, so no memo (which can't sit after the
  // early return above anyway).
  const copyAllLines: string[] = [];
  const pushLine = (label: string, value: string) =>
    copyAllLines.push(`${label}: ${value}`);
  if (view.dateIso) pushLine(t("budget.entryInfoDate"), dateText);
  if (view.description)
    pushLine(t("budget.entryInfoDescription"), view.description);
  if (view.bankDescription)
    pushLine(t("budget.entryInfoBankDescription"), view.bankDescription);
  if (view.amount !== null) pushLine(t("budget.entryInfoAmount"), amountText);
  if (entry?.balance !== undefined)
    pushLine(
      t("budget.entryInfoBalance"),
      formatAmount(entry.balance, settings),
    );
  if (view.type) {
    const cat = view.category ? ` (${view.category.name})` : "";
    pushLine(t("budget.entryInfoType"), `${view.type.name}${cat}`);
  }
  if (view.company) pushLine(t("budget.entryInfoCompany"), view.company.name);
  if (view.rowTags.length > 0)
    pushLine(
      t("budget.entryInfoTags"),
      view.rowTags.map((x) => x.name).join(", "),
    );
  const copyAllText = copyAllLines.join("\n");

  return (
    <Modal open={open} onClose={onClose} labelledBy="entry-info-title" centered>
      <Modal.Header
        icon={<Info size={14} aria-hidden focusable={false} />}
        title={t("budget.entryInfoTitle")}
        onClose={onClose}
      />
      <Modal.Body>
        <div className="flex flex-col gap-3">
          <span className="text-xs font-bold tracking-wider text-muted uppercase">
            {kindLabel}
          </span>

          <dl className="flex flex-col gap-2">
            <InfoField
              label={t("budget.entryInfoDate")}
              display={dateText}
              copyValue={view.dateIso ? dateText : null}
            />
            <InfoField
              label={t("budget.entryInfoDescription")}
              display={view.description || none}
              copyValue={view.description || null}
            />
            {view.bankDescription && (
              <InfoField
                label={t("budget.entryInfoBankDescription")}
                display={view.bankDescription}
                copyValue={view.bankDescription}
              />
            )}
            <InfoField
              label={t("budget.entryInfoAmount")}
              display={amountText}
              copyValue={view.amount !== null ? amountText : null}
              numeric
            />
            {entry?.balance !== undefined && (
              <InfoField
                label={t("budget.entryInfoBalance")}
                display={formatAmount(entry.balance, settings)}
                copyValue={formatAmount(entry.balance, settings)}
                numeric
              />
            )}
            <InfoField
              label={t("budget.entryInfoType")}
              display={
                <span className="flex min-w-0 items-center justify-end gap-1.5">
                  {view.type && (
                    <CategoryIconGlyph
                      name={view.type.glyph}
                      size={14}
                      style={{ color: view.type.color }}
                    />
                  )}
                  <span className="truncate">{typeText}</span>
                </span>
              }
              copyValue={
                view.type
                  ? view.category
                    ? `${view.type.name} (${view.category.name})`
                    : view.type.name
                  : null
              }
            />
            {view.category && (
              <InfoField
                label={t("budget.entryInfoCategory")}
                display={view.category.name}
                copyValue={view.category.name}
              />
            )}
            {view.company && (
              <InfoField
                label={t("budget.entryInfoCompany")}
                display={view.company.name}
                copyValue={view.company.name}
              />
            )}
            {view.rowTags.length > 0 && (
              <InfoField
                label={t("budget.entryInfoTags")}
                display={
                  <span className="flex flex-wrap justify-end gap-1">
                    {view.rowTags.map((tag) => (
                      <span
                        key={tag.id}
                        className="rounded-full px-2 py-0.5 text-xs"
                        style={{
                          color: tag.color,
                          border: `1px solid ${tag.color}`,
                        }}
                      >
                        {tag.name}
                      </span>
                    ))}
                  </span>
                }
                copyValue={view.rowTags.map((x) => x.name).join(", ")}
              />
            )}
            {row.seriesId && (
              <InfoField
                label={t("budget.entryInfoRecurring")}
                display={
                  <span className="flex items-center justify-end gap-1.5 text-fg-bright">
                    <Repeat size={14} aria-hidden focusable={false} />
                    {t("budget.entryInfoYes")}
                  </span>
                }
                copyValue={null}
              />
            )}
            {row.isTransfer && (
              <InfoField
                label={t("budget.entryInfoTransfer")}
                display={
                  <span className="flex items-center justify-end gap-1.5 text-fg-bright">
                    <ArrowLeftRight size={14} aria-hidden focusable={false} />
                    {t("budget.entryInfoYes")}
                  </span>
                }
                copyValue={null}
              />
            )}
            {entry?.importedAt !== undefined && (
              <InfoField
                label={t("budget.entryInfoImported")}
                display={new Date(entry.importedAt).toLocaleString(lang)}
                copyValue={null}
              />
            )}
            {view.rowLineItems.length > 0 && (
              <InfoField
                label={t("budget.entryInfoLineItems")}
                display={
                  <span className="flex flex-col items-end gap-0.5">
                    {view.rowLineItems.map((li) => (
                      <span key={li.id} className="truncate text-fg-bright">
                        {li.name}
                      </span>
                    ))}
                  </span>
                }
                copyValue={view.rowLineItems.map((x) => x.name).join(", ")}
              />
            )}
            {row.receiptPath !== undefined && (
              <InfoField
                label={t("budget.entryInfoReceipt")}
                display={
                  <span className="flex items-center justify-end gap-1.5 text-fg-bright">
                    <Receipt size={14} aria-hidden focusable={false} />
                    {t("budget.entryInfoYes")}
                  </span>
                }
                copyValue={null}
              />
            )}
          </dl>

          {entry?.splits && entry.splits.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-bold tracking-wider text-muted uppercase">
                {t("budget.entryInfoSplits")}
              </span>
              <ul className="flex flex-col gap-1">
                {entry.splits.map((split, i) => {
                  const splitType = split.typeId
                    ? (typesById.get(split.typeId) ?? null)
                    : null;
                  return (
                    <li
                      key={i}
                      className="flex items-center gap-2 rounded border border-line bg-surface-2 px-2 py-1.5 text-xs text-fg"
                    >
                      {splitType && (
                        <CategoryIconGlyph
                          name={splitType.glyph}
                          size={14}
                          style={{ color: splitType.color }}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">
                        {split.description}
                      </span>
                      <span className="shrink-0 font-mono tabular-nums text-fg-bright">
                        {formatAmount(split.amount, settings)}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      </Modal.Body>
      <Modal.Footer>
        <CopyAllButton text={copyAllText} />
        <Button variant="secondary" onClick={onClose}>
          {t("common.close")}
        </Button>
      </Modal.Footer>
    </Modal>
  );
}

// One label / value row. When `copyValue` is a non-empty string the
// value is wrapped in a copy-to-clipboard button; otherwise it renders
// as plain text (booleans / flags with nothing meaningful to copy).
function InfoField({
  label,
  display,
  copyValue,
  numeric,
}: {
  label: string;
  display: React.ReactNode;
  copyValue: string | null;
  numeric?: boolean;
}) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);
  const onCopy = () => {
    if (!copyValue) return;
    void navigator.clipboard?.writeText(copyValue).then(
      () => {
        setCopied(true);
        unlockAchievement("copycat");
      },
      () => setCopied(false),
    );
  };
  const valueClass = `min-w-0 flex-1 text-sm text-fg-bright ${
    numeric ? "font-mono tabular-nums" : ""
  }`;
  return (
    <div className="flex items-start justify-between gap-3">
      <dt className="shrink-0 pt-0.5 text-xs font-bold tracking-wider text-muted uppercase">
        {label}
      </dt>
      {copyValue ? (
        <dd className="flex min-w-0 flex-1 items-start justify-end gap-1.5">
          <span className={`${valueClass} text-right`}>{display}</span>
          <button
            type="button"
            onClick={onCopy}
            aria-label={
              copied
                ? t("budget.entryInfoCopied")
                : t("budget.entryInfoCopyField", { field: label })
            }
            title={
              copied
                ? t("budget.entryInfoCopied")
                : t("budget.entryInfoCopyField", { field: label })
            }
            className="mt-0.5 shrink-0 cursor-pointer border-0 bg-transparent p-0.5 text-muted hover:text-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            {copied ? (
              <Check
                size={14}
                className="text-success"
                aria-hidden
                focusable={false}
              />
            ) : (
              <Copy size={14} aria-hidden focusable={false} />
            )}
          </button>
        </dd>
      ) : (
        <dd className={`${valueClass} text-right`}>{display}</dd>
      )}
    </div>
  );
}

// The footer "copy all" button — lifts the whole entry onto the
// clipboard and flips to a check for a moment.
function CopyAllButton({ text }: { text: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const id = window.setTimeout(() => setCopied(false), 1500);
    return () => window.clearTimeout(id);
  }, [copied]);
  const onCopy = () => {
    void navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        unlockAchievement("copycat");
      },
      () => setCopied(false),
    );
  };
  return (
    <Button variant="secondary" onClick={onCopy} withIcon>
      {copied ? (
        <Check size={16} aria-hidden focusable={false} />
      ) : (
        <Copy size={16} aria-hidden focusable={false} />
      )}
      {copied ? t("budget.entryInfoCopied") : t("budget.entryInfoCopyAll")}
    </Button>
  );
}
