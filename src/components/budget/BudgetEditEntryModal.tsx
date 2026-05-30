import { Pencil } from "lucide-react";

import type {
  Category,
  Column,
  Company,
  EntryType,
  Row,
  Settings,
} from "../../data/types";
import { useT } from "../../i18n";
import { Modal } from "../Modal";
import { BudgetEditSeriesForm } from "./BudgetEditSeriesForm";
import {
  BudgetPromoteHistoryForm,
  type HistoryMatchPreview,
  type HistoryPromotePrefill,
  type HistoryPromotion,
} from "./BudgetPromoteHistoryForm";
import { BudgetPromoteToSeriesForm } from "./BudgetPromoteToSeriesForm";

export type { HistoryMatchPreview, HistoryPromotePrefill, HistoryPromotion };
export type { EditPatch, EditScope } from "../../data/action-payloads";
import type { EditPatch, EditScope } from "../../data/action-payloads";

type Props = {
  open: boolean;
  row: Row | null;
  columns: Column[];
  categories: Category[];
  types: readonly EntryType[];
  companies: readonly Company[];
  // companyId → suggested typeId for the auto-fill. When the user
  // picks a company on a row whose type isn't set and the company has
  // a confident suggestion, the type picker auto-fills behind the
  // CompanyPicker. `companyTypeHints` is the companyId → ranked hint
  // typeIds map forwarded to each sub-form's TypePicker for its
  // "Suggested" band. See `src/data/budget/company-type-hints.ts`.
  companyTypeSuggestions: ReadonlyMap<string, string>;
  companyTypeHints: ReadonlyMap<string, readonly string[]>;
  settings: Settings;
  // Last known date in the same series — defaults the "until" date when
  // editing a series row. `null` if this row isn't part of a series.
  lastSeriesDate: string | null;
  // For history rows: an existing merchant hint that matches the row's
  // normalised description, used to pre-fill the category / type /
  // user description on the promote form so a returning user doesn't
  // retype labels they've already taught the app. Null when no hint
  // exists or the row isn't a history row.
  historyHintPrefill?: HistoryPromotePrefill | null;
  // For regular row promotions: bank-history entries on the same
  // account whose normalised description matches this row's. Shown
  // alongside the future-recurrence preview so the user can see what
  // past entries will adopt the typed label, and rendered greyed-out
  // because they're already settled — they get backfilled with the
  // tag and description via the merchant-hint store, not by minting
  // new rows.
  historyMatches?: ReadonlyArray<HistoryMatchPreview>;
  onClose: () => void;
  onConvertToRecurring: (
    rowId: string,
    dates: string[],
    typeId: string | null,
    companyId: string | null,
  ) => void;
  onEditSeries: (rowId: string, patch: EditPatch, scope: EditScope) => void;
  // Fires when the user submits the promote form on a synthesized
  // history row. The reducer mints the future series, stamps the
  // merchant hint so past entries display under the same label, and
  // records the category memory.
  onPromoteHistory: (
    historyEntryId: string,
    rawDescription: string,
    promotion: HistoryPromotion,
  ) => void;
  onCreateType: (draft: Omit<EntryType, "id">) => EntryType;
  onCreateCategory: (draft: Omit<Category, "id">) => Category;
  onCreateCompany: (draft: Omit<Company, "id">) => Company;
};

// Dispatches one of three sub-form components based on the row shape:
// existing series (`row.seriesId`) → `BudgetEditSeriesForm`; synthesized
// history row (`row.historyEntryId`) → `BudgetPromoteHistoryForm`;
// otherwise → `BudgetPromoteToSeriesForm`. Each sub-form owns its own
// local state and emits a validated domain payload via `onSubmit`. The
// sub-forms are keyed by `row.id` so React re-mounts them when the
// modal is re-opened against a different row, replacing the
// `useResetOnOpen` re-snapshot that lived in this file before the
// split.
export function BudgetEditEntryModal({
  open,
  row,
  columns,
  categories,
  types,
  companies,
  companyTypeSuggestions,
  companyTypeHints,
  settings,
  lastSeriesDate,
  historyHintPrefill,
  historyMatches,
  onClose,
  onConvertToRecurring,
  onEditSeries,
  onPromoteHistory,
  onCreateType,
  onCreateCategory,
  onCreateCompany,
}: Props) {
  const t = useT();
  if (!open || !row) return null;

  const isSeries = !!row.seriesId;
  const isHistory = row.kind === "historic";

  const title = isSeries
    ? t("editEntry.titleEditSeries")
    : isHistory
      ? t("editEntry.titlePromoteHistory")
      : t("editEntry.titlePromote");

  return (
    <Modal
      open
      onClose={onClose}
      labelledBy="edit-entry-title"
      size="max-w-2xl"
    >
      <Modal.Header
        icon={<Pencil size={14} aria-hidden focusable={false} />}
        title={title}
        onClose={onClose}
      />
      {isSeries ? (
        <BudgetEditSeriesForm
          key={row.id}
          row={row}
          columns={columns}
          categories={categories}
          types={types}
          companies={companies}
          companyTypeSuggestions={companyTypeSuggestions}
          companyTypeHints={companyTypeHints}
          settings={settings}
          lastSeriesDate={lastSeriesDate}
          onClose={onClose}
          onSubmit={onEditSeries}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
          onCreateCompany={onCreateCompany}
        />
      ) : isHistory ? (
        <BudgetPromoteHistoryForm
          key={row.id}
          open={open}
          row={row}
          columns={columns}
          categories={categories}
          types={types}
          companies={companies}
          companyTypeSuggestions={companyTypeSuggestions}
          companyTypeHints={companyTypeHints}
          settings={settings}
          hintPrefill={historyHintPrefill}
          matches={historyMatches}
          onClose={onClose}
          onSubmit={onPromoteHistory}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
          onCreateCompany={onCreateCompany}
        />
      ) : (
        <BudgetPromoteToSeriesForm
          key={row.id}
          row={row}
          columns={columns}
          categories={categories}
          types={types}
          companies={companies}
          companyTypeSuggestions={companyTypeSuggestions}
          companyTypeHints={companyTypeHints}
          matches={historyMatches}
          onClose={onClose}
          onSubmit={onConvertToRecurring}
          onCreateType={onCreateType}
          onCreateCategory={onCreateCategory}
          onCreateCompany={onCreateCompany}
        />
      )}
    </Modal>
  );
}
